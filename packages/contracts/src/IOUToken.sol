// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title IOUToken
/// @notice ERC20 receipt token issued when the hook can't fulfill a redemption instantly.
///         Each IOU represents a claim on 1 unit of redeemAsset.
///         Decimals match the redeemAsset (e.g., 6 for USDC, 18 for DAI).
///         Only the hook contract can mint/burn IOUs.
contract IOUToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public immutable hook;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    error OnlyHook();
    error ZeroAddress();

    modifier onlyHook() {
        if (msg.sender != hook) revert OnlyHook();
        _;
    }

    constructor(string memory _name, string memory _symbol, address _hook, uint8 _decimals) {
        if (_hook == address(0)) revert ZeroAddress();
        name = _name;
        symbol = _symbol;
        hook = _hook;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external onlyHook {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyHook {
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
