// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Counter {
    uint256 public count;
    address public owner;

    event Incremented(uint256 newCount, address by);

    constructor(uint256 start) {
        count = start;
        owner = msg.sender;
    }

    function increment() external {
        count += 1;
        emit Incremented(count, msg.sender);
    }

    function add(uint256 n) external returns (uint256) {
        count += n;
        emit Incremented(count, msg.sender);
        return count;
    }
}
