/********************************************************************************
 *   RaiBlocks Ledger JS API
 *   (c) 2018 Mart Roosmaa
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
//@flow

import type Transport from "@ledgerhq/hw-transport";
import BIPPath from "bip32-path";
import bigInt from "big-integer";

/**
 * RaiBlocks API
 *
 * @example
 * import Xrb from "hw-app-xrb";
 * const xrb = new Xrb(transport);
 */
export default class Xrb {
  transport: Transport<*>;

  constructor(transport: Transport<*>) {
    this.transport = transport;
    transport.setScrambleKey("mRB");
  }

  /**
   * Get RaiBlocks address for the given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolDisplay display the address on the device
   * @option boolChaincode query for the chain code associated with the given BIP 32 path
   * @return an object with a publicKey, address and (optionally) chainCode
   * @example
   * xrb.getAddress("44'/165'/0'").then(o => o.address)
   */
  async getAddress(
    path: string,
    boolDisplay?: boolean,
    boolChaincode?: boolean
  ): Promise<{
    publicKey: string,
    address: string,
    chainCode?: string
  }> {
    const bipPath = BIPPath.fromString(path).toPathArray();

    const cla = 0xa1;
    const ins = 0x02;
    const p1 = boolDisplay ? 0x01 : 0x00;
    const p2 = boolChaincode ? 0x01 : 0x00;

    let size = 1 + 4 * bipPath.length; // bipPath

    let buf = Buffer.alloc(size);
    buf.writeUInt8(bipPath.length, 0);
    bipPath.forEach((segment, index) => {
      buf.writeUInt32BE(segment, 1 + 4 * index);
    });

    buf = await this.transport.send(cla, ins, p1, p2, buf);
    let ptr = 0;

    const result = {};
    const publicKeyLength = buf.readUInt8(ptr);
    ptr += 1 + publicKeyLength;
    result.publicKey = buf.slice(ptr - publicKeyLength, ptr).toString("hex");

    const addressLength = buf.readUInt8(ptr);
    ptr += 1 + addressLength;
    result.address = buf.slice(ptr - addressLength, ptr).toString("ascii");

    if (boolChaincode) {
      ptr += 32;
      result.chainCode = buf.slice(ptr - 32, ptr).toString("hex");
    }

    return result;
  }

  /**
   * Generate a signature for an open block
   * @param path a path in BIP 32 format
   * @param sourceBlock hash (in hex) of the block from which to receive the funds
   * @param representative account of the representative for the account being opened
   * @return an object with a blockHash and signature
   * @example
   * xrb.signOpenBlock(
   *   "44'/165'/0'",
   *   "xrb_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
   *   "06B95C8A7EC4116E5BD907CD6DC65D310E065992A2E1D02F337D1A8308DEBC14"
   * ).then(o => o.signature)
   */
  async signOpenBlock(
    path: string,
    sourceBlock: string,
    representative: string
  ): Promise<{
    blockHash: string,
    signature: string
  }> {
    if (sourceBlock.length != 64) {
      throw new Error("`sourceBlock` must be a 64 character hex string");
    }
    if (representative.length != 64) {
      throw new Error(
        "`representative` must be a 64 character RaiBlock address"
      );
    }

    const bipPath = BIPPath.fromString(path).toPathArray();

    const cla = 0xa1;
    const ins = 0x03;
    const p1 = 0x00;
    const p2 = 0x00;

    let size = 1 + 4 * bipPath.length; // bipPath
    size += 1 + representative.length; // representative
    size += 32; // sourceBlock

    let ptr = 0;
    let buf = Buffer.alloc(size);

    buf.writeUInt8(bipPath.length, ptr);
    ptr += 1;
    bipPath.forEach((segment, index) => {
      buf.writeUInt32BE(segment, ptr);
      ptr += 4;
    });

    buf.writeUInt8(representative.length, ptr);
    ptr += 1;
    buf.write(representative, ptr, representative.length, "ascii");
    ptr += representative.length;

    buf.write(sourceBlock, ptr, 32, "hex");
    ptr += 32;

    buf = await this.transport.send(cla, ins, p1, p2, buf);
    ptr = 0;

    const result = {};
    ptr += 32;
    result.blockHash = buf.slice(ptr - 32, ptr).toString("hex");

    ptr += 64;
    result.signature = buf.slice(ptr - 64, ptr).toString("hex");

    return result;
  }

  /**
   * Generate a signature for a receive block
   * @param path a path in BIP 32 format
   * @param previousBlock hash (in hex) of the previous block in the account chain
   * @param sourceBlock hash (in hex) of the block from which to receive the funds
   * @return an object with a blockHash and signature
   * @example
   * xrb.signReceiveBlock(
   *   "44'/165'/0'",
   *   "991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948",
   *   "06B95C8A7EC4116E5BD907CD6DC65D310E065992A2E1D02F337D1A8308DEBC14"
   * ).then(o => o.signature)
   */
  async signReceiveBlock(
    path: string,
    previousBlock: string,
    sourceBlock: string
  ): Promise<{
    blockHash: string,
    signature: string
  }> {
    if (previousBlock.length != 64) {
      throw new Error("`previousBlock` must be a 64 character hex string");
    }
    if (sourceBlock.length != 64) {
      throw new Error("`sourceBlock` must be a 64 character hex string");
    }

    const bipPath = BIPPath.fromString(path).toPathArray();

    const cla = 0xa1;
    const ins = 0x03;
    const p1 = 0x01;
    const p2 = 0x00;

    let size = 1 + 4 * bipPath.length; // bipPath
    size += 32; // previousBlock
    size += 32; // sourceBlock

    let ptr = 0;
    let buf = Buffer.alloc(size);

    buf.writeUInt8(bipPath.length, ptr);
    ptr += 1;
    bipPath.forEach((segment, index) => {
      buf.writeUInt32BE(segment, ptr);
      ptr += 4;
    });

    buf.write(previousBlock, ptr, 32, "hex");
    ptr += 32;

    buf.write(sourceBlock, ptr, 32, "hex");
    ptr += 32;

    buf = await this.transport.send(cla, ins, p1, p2, buf);
    ptr = 0;

    const result = {};
    ptr += 32;
    result.blockHash = buf.slice(ptr - 32, ptr).toString("hex");

    ptr += 64;
    result.signature = buf.slice(ptr - 64, ptr).toString("hex");

    return result;
  }

  /**
   * Generate a signature for a send block
   * @param path a path in BIP 32 format
   * @param previousBlock hash (in hex) of the previous block in the account chain
   * @param destinationAddress address of the account to send XRB to
   * @param balance new account balance (uint128 encoded as big endian bytes in hex) after the transfer
   * @return an object with a blockHash and signature
   * @example
   * xrb.signReceiveBlock(
   *   "44'/165'/0'",
   *   "991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948",
   *   "xrb_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
   *   "00000000000B949D854F34FECE000000" // 0.000014 XRB
   * ).then(o => o.signature)
   */
  async signSendBlock(
    path: string,
    previousBlock: string,
    destinationAddress: string,
    balance: string
  ): Promise<{
    blockHash: string,
    signature: string
  }> {
    if (previousBlock.length != 64) {
      throw new Error("`previousBlock` must be a 64 character hex string");
    }
    if (destinationAddress.length != 64) {
      throw new Error(
        "`destinationAddress` must be a 64 character RaiBlock address"
      );
    }
    if (balance.length != 32) {
      throw new Error("`balance` must be a 32 character hex string");
    }

    const bipPath = BIPPath.fromString(path).toPathArray();

    const cla = 0xa1;
    const ins = 0x03;
    const p1 = 0x02;
    const p2 = 0x00;

    let size = 1 + 4 * bipPath.length; // bipPath
    size += 32; // previousBlock
    size += 1 + destinationAddress.length; // destinationAddress
    size += 16; // balance

    let ptr = 0;
    let buf = Buffer.alloc(size);

    buf.writeUInt8(bipPath.length, ptr);
    ptr += 1;
    bipPath.forEach((segment, index) => {
      buf.writeUInt32BE(segment, ptr);
      ptr += 4;
    });

    buf.write(previousBlock, ptr, 32, "hex");
    ptr += 32;

    buf.writeUInt8(destinationAddress.length, ptr);
    ptr += 1;
    buf.write(destinationAddress, ptr, destinationAddress.length, "ascii");
    ptr += destinationAddress.length;

    buf.write(balance, ptr, 16, "hex");
    ptr += 16;

    buf = await this.transport.send(cla, ins, p1, p2, buf);
    ptr = 0;

    const result = {};
    ptr += 32;
    result.blockHash = buf.slice(ptr - 32, ptr).toString("hex");

    ptr += 64;
    result.signature = buf.slice(ptr - 64, ptr).toString("hex");

    return result;
  }

  /**
   * Generate a signature for a change block
   * @param path a path in BIP 32 format
   * @param previousBlock hash (in hex) of the previous block in the account chain
   * @param representative account of the new representative for the account
   * @return an object with a blockHash and signature
   * @example
   * xrb.signChangeBlock(
   *   "44'/165'/0'",
   *   "991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948",
   *   "xrb_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k"
   * ).then(o => o.signature)
   */
  async signChangeBlock(
    path: string,
    previousBlock: string,
    representative: string
  ): Promise<{
    blockHash: string,
    signature: string
  }> {
    if (previousBlock.length != 64) {
      throw new Error("`previousBlock` must be a 64 character hex string");
    }
    if (representative.length != 64) {
      throw new Error(
        "`representative` must be a 64 character RaiBlock address"
      );
    }

    const bipPath = BIPPath.fromString(path).toPathArray();

    const cla = 0xa1;
    const ins = 0x03;
    const p1 = 0x03;
    const p2 = 0x00;

    let size = 1 + 4 * bipPath.length; // bipPath
    size += 32; // previousBlock
    size += 1 + representative.length; // representative

    let ptr = 0;
    let buf = Buffer.alloc(size);

    buf.writeUInt8(bipPath.length, ptr);
    ptr += 1;
    bipPath.forEach((segment, index) => {
      buf.writeUInt32BE(segment, ptr);
      ptr += 4;
    });

    buf.write(previousBlock, ptr, 32, "hex");
    ptr += 32;

    buf.writeUInt8(representative.length, ptr);
    ptr += 1;
    buf.write(representative, ptr, representative.length, "ascii");
    ptr += representative.length;

    buf = await this.transport.send(cla, ins, p1, p2, buf);
    ptr = 0;

    const result = {};
    ptr += 32;
    result.blockHash = buf.slice(ptr - 32, ptr).toString("hex");

    ptr += 64;
    result.signature = buf.slice(ptr - 64, ptr).toString("hex");

    return result;
  }

  /**
   * Encode the balance value (128bit big endian integer) as hex string
   * @param value string representation of a base 10 number
   * @return a string that of hex encoded value of the value
   * @example
   * Xrb.encodeBalance("14000000000000000000000000") == "00000000000B949D854F34FECE000000"
   */
  static encodeBalance(value: string): string {
    value = bigInt(value, 10).toString(16);
    if (value.length < 32) {
      value = "0".repeat(32 - value.length) + value;
    }
    return value;
  }

  /**
   * Decode the balance value (128bit big endian integer) from hex string
   * @param value hex encoded value
   * @return a string of the number in base 10
   * @example
   * Xrb.decodeBalance("00000000000B949D854F34FECE000000") == "14000000000000000000000000"
   */
  static decodeBalance(value: string): string {
    return bigInt(value, 16).toString();
  }
}
