// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Deliberately vulnerable: the balance is cleared AFTER the external
/// call, so a contract that re-enters from its receive() drains the pool.
/// Used by the sandbox tests to prove an exploit runs, then that the fix stops it.
contract Vault {
    error NotOwner();

    event Deposit(address indexed who, uint256 amount);
    event Withdraw(address indexed who, uint256 amount);

    address public immutable owner;
    mapping(address => uint256) public balanceOf;

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdrawAll() external {
        uint256 amount = balanceOf[msg.sender];
        require(amount > 0, "nothing to withdraw");
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "send failed");
        balanceOf[msg.sender] = 0; // interaction happened first
        emit Withdraw(msg.sender, amount);
    }

    function sweep() external {
        if (msg.sender != owner) revert NotOwner();
        (bool sent, ) = payable(owner).call{value: address(this).balance}("");
        require(sent, "send failed");
    }

    function totalHeld() external view returns (uint256) {
        return address(this).balance;
    }
}

/// @notice Same contract with checks-effects-interactions applied.
contract SafeVault {
    error NotOwner();

    event Deposit(address indexed who, uint256 amount);
    event Withdraw(address indexed who, uint256 amount);

    address public immutable owner;
    mapping(address => uint256) public balanceOf;

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdrawAll() external {
        uint256 amount = balanceOf[msg.sender];
        require(amount > 0, "nothing to withdraw");
        balanceOf[msg.sender] = 0; // effect before interaction
        emit Withdraw(msg.sender, amount);
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "send failed");
    }

    function sweep() external {
        if (msg.sender != owner) revert NotOwner();
        (bool sent, ) = payable(owner).call{value: address(this).balance}("");
        require(sent, "send failed");
    }

    function totalHeld() external view returns (uint256) {
        return address(this).balance;
    }
}
