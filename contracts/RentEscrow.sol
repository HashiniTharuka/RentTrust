// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RentTrust Escrow
/// @author EC8204 Group Project
/// @notice Holds a tenant's rental deposit on-chain and settles it transparently
///         via agreed voting or an arbitrator decision.
/// @dev Security notes (for the "Cyber Security" half of this module):
///      - Follows Checks-Effects-Interactions: state and amounts are zeroed out
///        BEFORE any ETH transfer, preventing reentrancy attacks.
///      - Uses OpenZeppelin's ReentrancyGuard as a second layer of defence.
///      - Uses low-level `call{value:...}` instead of `transfer`/`send` to avoid
///        the 2300-gas stipend problem that can permanently lock funds.
///      - Role-based access: landlord / tenant / arbitrator each have
///        restricted function access enforced on-chain.
///      - Move-in and move-out evidence is stored as keccak256 hashes so that
///        photos are never uploaded to a server, preserving privacy.
///      - On-chain voting requires agreement to settle; disagreement automatically
///        escalates to the arbitrator, preventing one party from blocking funds.
contract RentEscrow is ReentrancyGuard {

    // ─── State machine ────────────────────────────────────────────────────────
    enum Status { Created, Funded, EvidenceSubmitted, Disputed, Settled }

    // ─── Tenancy record ───────────────────────────────────────────────────────
    struct Tenancy {
        address landlord;
        address tenant;
        address arbitrator;
        uint256 depositAmount;
        bytes32 moveInHash;    // keccak256 of move-in evidence (photo or document)
        bytes32 moveOutHash;   // keccak256 of move-out evidence
        uint8   landlordVote;  // 1 = release to tenant, 2 = return to landlord
        uint8   tenantVote;
        uint8   arbitratorVote;
        Status  status;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────
    uint256 public nextId;
    mapping(uint256 => Tenancy) private _tenancies;

    // ─── Events ───────────────────────────────────────────────────────────────
    event TenancyCreated(uint256 indexed id, address landlord, address tenant, address arbitrator);
    event DepositFunded(uint256 indexed id, uint256 amount);
    event MoveInRecorded(uint256 indexed id, bytes32 hash);
    event EvidenceSubmitted(uint256 indexed id, bytes32 hash);
    event Disputed(uint256 indexed id);
    event VoteCast(uint256 indexed id, address voter, uint8 choice);
    event Settled(uint256 indexed id, address recipient, uint256 amount);

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyParty(uint256 id) {
        Tenancy storage t = _tenancies[id];
        require(
            msg.sender == t.landlord ||
            msg.sender == t.tenant   ||
            msg.sender == t.arbitrator,
            "RentTrust: caller is not a party"
        );
        _;
    }

    modifier inStatus(uint256 id, Status expected) {
        require(_tenancies[id].status == expected, "RentTrust: wrong status for this action");
        _;
    }

    modifier tenancyExists(uint256 id) {
        require(id < nextId, "RentTrust: tenancy does not exist");
        _;
    }

    // ─── Functions ────────────────────────────────────────────────────────────

    /// @notice Landlord creates a new tenancy agreement specifying the tenant
    ///         and a neutral arbitrator to resolve any future dispute.
    function createTenancy(address tenant, address arbitrator) external returns (uint256) {
        require(tenant    != address(0) && arbitrator != address(0), "RentTrust: zero address");
        require(tenant    != msg.sender, "RentTrust: landlord and tenant must differ");
        require(arbitrator != msg.sender, "RentTrust: arbitrator must be independent of landlord");
        require(arbitrator != tenant,    "RentTrust: arbitrator must be independent of tenant");

        uint256 id = nextId++;
        Tenancy storage t = _tenancies[id];
        t.landlord   = msg.sender;
        t.tenant     = tenant;
        t.arbitrator = arbitrator;
        t.status     = Status.Created;

        emit TenancyCreated(id, msg.sender, tenant, arbitrator);
        return id;
    }

    /// @notice Tenant locks the deposit into the contract.
    function fundDeposit(uint256 id)
        external
        payable
        tenancyExists(id)
        inStatus(id, Status.Created)
    {
        require(msg.sender == _tenancies[id].tenant, "RentTrust: only the tenant may fund");
        require(msg.value > 0, "RentTrust: deposit must be greater than zero");

        _tenancies[id].depositAmount = msg.value;
        _tenancies[id].status = Status.Funded;

        emit DepositFunded(id, msg.value);
    }

    /// @notice Landlord records the move-in condition hash (e.g. hash of inspection photos).
    function recordMoveIn(uint256 id, bytes32 hash)
        external
        tenancyExists(id)
    {
        Tenancy storage t = _tenancies[id];
        require(msg.sender == t.landlord, "RentTrust: only the landlord may record move-in");
        require(t.status == Status.Created || t.status == Status.Funded, "RentTrust: wrong status");
        require(hash != bytes32(0), "RentTrust: hash must not be empty");

        t.moveInHash = hash;
        emit MoveInRecorded(id, hash);
    }

    /// @notice Any party submits the move-out condition hash to start the settlement process.
    function submitEvidence(uint256 id, bytes32 hash)
        external
        tenancyExists(id)
        onlyParty(id)
        inStatus(id, Status.Funded)
    {
        require(hash != bytes32(0), "RentTrust: hash must not be empty");

        _tenancies[id].moveOutHash = hash;
        _tenancies[id].status = Status.EvidenceSubmitted;

        emit EvidenceSubmitted(id, hash);
    }

    /// @notice Each party votes on deposit outcome.
    ///         choice = 1  → release deposit back to tenant (no damage)
    ///         choice = 2  → release deposit to landlord (damage claimed)
    ///         If landlord and tenant agree, the contract settles immediately.
    ///         If they disagree, the status moves to Disputed and the arbitrator casts the deciding vote.
    function vote(uint256 id, uint8 choice)
        external
        tenancyExists(id)
        onlyParty(id)
    {
        Tenancy storage t = _tenancies[id];
        require(
            t.status == Status.EvidenceSubmitted || t.status == Status.Disputed,
            "RentTrust: voting not open"
        );
        require(choice == 1 || choice == 2, "RentTrust: choice must be 1 (tenant) or 2 (landlord)");

        if (msg.sender == t.tenant) {
            require(t.tenantVote == 0, "RentTrust: tenant already voted");
            t.tenantVote = choice;
        } else if (msg.sender == t.landlord) {
            require(t.landlordVote == 0, "RentTrust: landlord already voted");
            t.landlordVote = choice;
        } else {
            // arbitrator
            require(t.status == Status.Disputed, "RentTrust: arbitrator may only vote after a dispute");
            require(t.arbitratorVote == 0, "RentTrust: arbitrator already voted");
            t.arbitratorVote = choice;
        }

        emit VoteCast(id, msg.sender, choice);

        // Escalate to dispute if both parties disagree
        if (
            t.tenantVote != 0 &&
            t.landlordVote != 0 &&
            t.tenantVote != t.landlordVote &&
            t.status == Status.EvidenceSubmitted
        ) {
            t.status = Status.Disputed;
            emit Disputed(id);
            return;
        }

        _trySettle(id);
    }

    /// @dev Internal: attempt to finalize the tenancy if a winning outcome is determined.
    function _trySettle(uint256 id) internal nonReentrant {
        Tenancy storage t = _tenancies[id];
        uint8 outcome;

        if (t.tenantVote != 0 && t.tenantVote == t.landlordVote) {
            // Both agree
            outcome = t.tenantVote;
        } else if (t.status == Status.Disputed && t.arbitratorVote != 0) {
            // Arbitrator breaks the tie
            outcome = t.arbitratorVote;
        }

        if (outcome != 0) {
            address recipient = (outcome == 1) ? t.tenant : t.landlord;
            uint256 amount = t.depositAmount;

            // Checks-Effects-Interactions: zero amount before transfer
            t.depositAmount = 0;
            t.status = Status.Settled;

            (bool ok, ) = payable(recipient).call{value: amount}("");
            require(ok, "RentTrust: ETH transfer failed");

            emit Settled(id, recipient, amount);
        }
    }

    /// @notice Returns full tenancy details for a given ID.
    function getTenancy(uint256 id)
        external
        view
        tenancyExists(id)
        returns (Tenancy memory)
    {
        return _tenancies[id];
    }

    /// @notice Convenience: returns the current status label for a tenancy.
    function getStatus(uint256 id)
        external
        view
        tenancyExists(id)
        returns (Status)
    {
        return _tenancies[id].status;
    }
}
