// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RentTrust Escrow
/// @notice Holds a rental deposit and settles it via agreement or arbitrator vote.
contract RentEscrow {
    enum Status { Created, Funded, EvidenceSubmitted, Disputed, Settled }

    struct Tenancy {
        address landlord;
        address tenant;
        address arbitrator;
        uint256 depositAmount;
        bytes32 moveInHash;
        bytes32 moveOutHash;
        uint256 landlordVote;
        uint256 tenantVote;
        uint256 arbitratorVote;
        Status status;
    }

    uint256 public nextId;
    mapping(uint256 => Tenancy) public tenancies;

    event TenancyCreated(uint256 id, address landlord, address tenant, address arbitrator);
    event DepositFunded(uint256 id, uint256 amount);
    event MoveInRecorded(uint256 id, bytes32 hash);
    event EvidenceSubmitted(uint256 id, bytes32 hash);
    event Disputed(uint256 id);
    event Settled(uint256 id, address recipient, uint256 amount);

    modifier onlyParty(uint256 id) {
        Tenancy storage t = tenancies[id];
        require(
            msg.sender == t.landlord || msg.sender == t.tenant || msg.sender == t.arbitrator,
            "not a party"
        );
        _;
    }

    function createTenancy(address tenant, address arbitrator) external returns (uint256) {
        require(tenant != address(0) && arbitrator != address(0), "invalid party");
        require(tenant != msg.sender && arbitrator != msg.sender && tenant != arbitrator, "parties must differ");
        uint256 id = nextId++;
        Tenancy storage t = tenancies[id];
        t.landlord = msg.sender;
        t.tenant = tenant;
        t.arbitrator = arbitrator;
        t.status = Status.Created;
        emit TenancyCreated(id, msg.sender, tenant, arbitrator);
        return id;
    }

    function fundDeposit(uint256 id) external payable {
        Tenancy storage t = tenancies[id];
        require(msg.sender == t.tenant, "only tenant");
        require(t.status == Status.Created, "already funded");
        require(msg.value > 0, "deposit required");
        t.depositAmount = msg.value;
        t.status = Status.Funded;
        emit DepositFunded(id, msg.value);
    }

    function recordMoveIn(uint256 id, bytes32 hash) external {
        Tenancy storage t = tenancies[id];
        require(msg.sender == t.landlord, "only landlord");
        require(t.status == Status.Created || t.status == Status.Funded, "wrong status");
        require(hash != bytes32(0), "hash required");
        t.moveInHash = hash;
        emit MoveInRecorded(id, hash);
    }

    function submitEvidence(uint256 id, bytes32 hash) external onlyParty(id) {
        Tenancy storage t = tenancies[id];
        require(t.status == Status.Funded, "wrong status");
        require(hash != bytes32(0), "hash required");
        t.moveOutHash = hash;
        t.status = Status.EvidenceSubmitted;
        emit EvidenceSubmitted(id, hash);
    }

    function vote(uint256 id, uint256 choice) external onlyParty(id) {
        Tenancy storage t = tenancies[id];
        require(t.status == Status.EvidenceSubmitted || t.status == Status.Disputed, "wrong status");
        require(choice == 1 || choice == 2, "invalid choice");

        if (msg.sender == t.tenant) {
            t.tenantVote = choice;
        } else if (msg.sender == t.landlord) {
            t.landlordVote = choice;
        } else {
            require(t.status == Status.Disputed, "arbitrator votes only after dispute");
            t.arbitratorVote = choice;
        }

        if (t.tenantVote != 0 && t.landlordVote != 0 && t.tenantVote != t.landlordVote && t.status != Status.Disputed) {
            t.status = Status.Disputed;
            emit Disputed(id);
            return;
        }
        _trySettle(id);
    }

    function _trySettle(uint256 id) internal {
        Tenancy storage t = tenancies[id];
        uint256 outcome;
        if (t.tenantVote != 0 && t.tenantVote == t.landlordVote) {
            outcome = t.tenantVote;
        } else if (t.status == Status.Disputed && t.arbitratorVote != 0) {
            outcome = t.arbitratorVote;
        }
        if (outcome != 0) {
            address recipient = outcome == 1 ? t.tenant : t.landlord;
            uint256 amount = t.depositAmount;
            t.status = Status.Settled;
            t.depositAmount = 0;
            (bool ok, ) = payable(recipient).call{value: amount}("");
            require(ok, "transfer failed");
            emit Settled(id, recipient, amount);
        }
    }

    function getTenancy(uint256 id) external view returns (Tenancy memory) {
        return tenancies[id];
    }
}
