// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Minimal ERC-20 with a public mint, for deterministic swap tests.
contract MockToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s) {
        name = n;
        symbol = s;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// Pulls sellToken via transferFrom (needs allowance) and pays out buyToken 1:2.
contract MockRouter {
    function swap(address sellToken, address buyToken, uint256 amountIn) external {
        MockToken(sellToken).transferFrom(msg.sender, address(this), amountIn);
        MockToken(buyToken).mint(msg.sender, amountIn * 2);
    }
}
