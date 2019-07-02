pragma solidity 0.4.26;

import "../Standards/IERC223Token.sol";
import "../Standards/IERC223Callback.sol";


contract TestERC223Callback is IERC223Callback {

    ////////////////////////
    // Mutable state
    ////////////////////////
    address private _from;
    uint256 private _amount;
    bytes32 private _dataKeccak;


    ////////////////////////
    // Constructor
    ////////////////////////
    constructor() public {
        // some "random" hash
        _dataKeccak = keccak256(abi.encodePacked(address(this)));
    }

    ////////////////////////
    // Public functions
    ////////////////////////
    function tokenFallback(address from, uint256 amount, bytes data)
        public
    {
        _from = from;
        _amount = amount;
        _dataKeccak = keccak256(data);
    }

    function amount() public constant returns (uint256) {
        return _amount;
    }

    function from() public constant returns (address) {
        return _from;
    }

    function dataKeccak() public constant returns (bytes32) {
        return _dataKeccak;
    }
}
