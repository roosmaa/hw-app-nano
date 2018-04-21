/********************************************************************************
 *   $NANO Ledger JS API
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
import nanoBase32 from "nano-base32";
import bigInt from "big-integer";
import { blake2b } from "blakejs";

/**
 * An enum containing the common status codes returned via
 * the TransportStatusError#statusCode field.
 * @example
 * nano.getAddress("44'/165'/0'", true).then(o => {
 *   // ...
 * }, err => {
 *   if (err.statusCode == STATUS_CODES.CONDITIONS_OF_USE_NOT_SATISFIED) {
 *     console.log('User cancelled the request');
 *   }
 *   // ..
 * });
 */
export const STATUS_CODES = {
  /**
   * Security status not satisfied is returned when the
   * device is still locked
   */
  SECURITY_STATUS_NOT_SATISFIED: 0x6982,
  /**
   * Conditions of use not satisfied is returned when the
   * user declines the request to complete the action.
   */
  CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
  /**
   * Failed to verify the provided signature.
   */
  INVALID_SIGNATURE: 0x6a81,
  /**
   * Parent block data was not found in cache.
   */
  CACHE_MISS: 0x6a82
};

type OpenBlockData = {|
  previousBlock?: null,
  representative: string,
  balance: string,
  sourceBlock: string,
  recipient?: null
|};

type ReceiveBlockData = {|
  previousBlock: string,
  representative: string,
  balance: string,
  sourceBlock: string,
  recipient?: null
|};

type SendBlockData = {|
  previousBlock: string,
  representative: string,
  balance: string,
  sourceBlock?: null,
  recipient: string
|};

type ChangeBlockData = {|
  previousBlock: string,
  representative: string,
  balance: string,
  sourceBlock?: null,
  recipient?: null
|};

/**
 * Union type of all of the valid block data configurations.
 *
 * @property {string?} previousBlock hash (in hex) of the previous block in the account chain
 * @property {string} representative address of the representative (both nano and xrb addresses are supported)
 * @property {string} balance new account balance after the transaction
 * @property {string?} sourceBlock hash (in hex) of the block from which to receive the funds
 * @property {string?} recipient address of the account to send Nano to (both nano and xrb addresses are supported)
 *
 * @example <caption>Open block data</caption>
 * let openBlockData = {
 *   representative: "xrb_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
 *   balance: "100000000000000000000000000000000",
 *   sourceBlock: "06B95C8A7EC4116E5BD907CD6DC65D310E065992A2E1D02F337D1A8308DEBC14"
 * };
 *
 * @example <caption>Receive block data</caption>
 * let receiveBlockData = {
 *   previousBlock: "991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948",
 *   representative: "xrb_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
 *   balance: "100000000000000000000000000000000",
 *   sourceBlock: "06B95C8A7EC4116E5BD907CD6DC65D310E065992A2E1D02F337D1A8308DEBC14"
 * };
 *
 * @example <caption>Send block data</caption>
 * let sendBlockData = {
 *   previousBlock: "991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948",
 *   representative: "xrb_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
 *   balance: "100000000000000000000000000000000",
 *   recipient: "nano_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k"
 * };
 *
 * @example <caption>Change block data</caption>
 * let changeBlockData = {
 *   previousBlock: "991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948",
 *   representative: "xrb_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
 *   balance: "100000000000000000000000000000000"
 * };
 */
export type BlockData =
  | OpenBlockData
  | ReceiveBlockData
  | SendBlockData
  | ChangeBlockData;

function decodeAddress(address: string): ?Buffer {
  if (address.startsWith("nano_")) {
    address = address.substr(5);
  } else if (address.startsWith("xrb_")) {
    address = address.substr(4);
  }

  if (!/[13][0-9a-km-uw-z]{59}/.test(address)) {
    return null;
  }

  const bytes = nanoBase32.decode(address);
  const publicKey = bytes.subarray(0, 32);
  const checksum = bytes.subarray(32);

  const computedChecksum = blake2b(publicKey, null, 5).reverse();

  if (checksum.length != computedChecksum.length) {
    return null;
  }
  for (let i = 0; i < computedChecksum.length; i++) {
    if (checksum[i] != computedChecksum[i]) {
      return null;
    }
  }

  return Buffer.from(publicKey);
}

/**
 * Encode the balance value (128bit big endian integer) as hex string
 * @param value string representation of a base 10 number
 * @return a string that of hex encoded value of the value
 * @example
 * Nano.encodeBalance("14000000000000000000000000") == "00000000000B949D854F34FECE000000"
 */
export function encodeBalance(value: string): string {
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
 * Nano.decodeBalance("00000000000B949D854F34FECE000000") == "14000000000000000000000000"
 */
export function decodeBalance(value: string): string {
  return bigInt(value, 16).toString();
}

function processBlockData(
  b: BlockData
): {|
  representativePublicKey: Buffer,
  recipientPublicKey: ?Buffer
|} {
  if (b.previousBlock && b.previousBlock.length != 64) {
    throw new Error("`previousBlock` must be a 64 character hex string");
  }
  const representativePublicKey = decodeAddress(b.representative);
  if (!representativePublicKey) {
    throw new Error(
      "`representative` must be either a 65 character nano address or a 64 character xrb address"
    );
  }
  if (b.balance.length != 32) {
    throw new Error("`balance` must be a 32 character hex string");
  }
  if (b.sourceBlock && b.sourceBlock.length != 64) {
    throw new Error("`sourceBlock` must be a 64 character hex string");
  }
  const recipientPublicKey = b.recipient ? decodeAddress(b.recipient) : null;
  if (b.recipient && !recipientPublicKey) {
    throw new Error(
      "`recipient` must be either a 65 character nano address or a 64 character xrb address"
    );
  }

  const isOpenBlock = !b.previousBlock && b.sourceBlock && !b.recipient;
  const isReceiveBlock = b.previousBlock && b.sourceBlock && !b.recipient;
  const isSendBlock = b.previousBlock && !b.sourceBlock && b.recipient;
  const isChangeBlock = b.previousBlock && !b.sourceBlock && !b.recipient;
  if (!isOpenBlock && !isReceiveBlock && !isSendBlock && !isChangeBlock) {
    throw new Error("`blockData` optional field configuration is unsupported");
  }

  return {
    representativePublicKey,
    recipientPublicKey
  };
}

/**
 * Nano API (default export of this module)
 *
 * @example
 * import Nano from "hw-app-nano";
 * const nano = new Nano(transport);
 */
export default class Nano {
  transport: Transport<*>;

  constructor(transport: Transport<*>) {
    this.transport = transport;
    transport.setScrambleKey("mRB");
  }

  /**
   * Get Nano application configuration.
   * @return an object with a version
   * @example
   * nano.getAppConfiguration().then(o => o.version)
   */
  async getAppConfiguration(): Promise<{|
    version: string
  |}> {
    const cla = 0xa1;
    const ins = 0x01;
    const p1 = 0x00;
    const p2 = 0x00;

    let size = 0;
    let buf = Buffer.alloc(size);

    buf = await this.transport.send(cla, ins, p1, p2, buf);
    let ptr = 0;

    const versionMajor = buf.readUInt8(ptr);
    ptr += 1;
    const versionMinor = buf.readUInt8(ptr);
    ptr += 1;
    const versionPatch = buf.readUInt8(ptr);
    ptr += 1;

    return {
      version: "" + versionMajor + "." + versionMinor + "." + versionPatch
    };
  }

  /**
   * Get Nano address for the given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolDisplay display the address on the device
   * @return an object with a publicKey and address
   * @example
   * nano.getAddress("44'/165'/0'").then(o => o.address)
   */
  async getAddress(
    path: string,
    boolDisplay?: boolean
  ): Promise<{|
    publicKey: string,
    address: string
  |}> {
    const bipPath = BIPPath.fromString(path).toPathArray();

    const cla = 0xa1;
    const ins = 0x02;
    const p1 = boolDisplay ? 0x01 : 0x00;
    const p2 = 0x00;

    let size = 1 + 4 * bipPath.length; // bipPath

    let buf = Buffer.alloc(size);
    buf.writeUInt8(bipPath.length, 0);
    bipPath.forEach((segment, index) => {
      buf.writeUInt32BE(segment, 1 + 4 * index);
    });

    buf = await this.transport.send(cla, ins, p1, p2, buf);
    let ptr = 0;

    ptr += 32;
    const publicKey = buf.slice(ptr - 32, ptr).toString("hex");

    const addressLength = buf.readUInt8(ptr);
    ptr += 1 + addressLength;
    const address = buf.slice(ptr - addressLength, ptr).toString("ascii");

    return {
      publicKey,
      address
    };
  }

  /**
   * Generate a signature for a block
   * @param path a path of the account in BIP 32 format
   * @param blockData block data to hash and sign
   *
   * @example <caption>Opening an account</caption>
   * nano.signBlock("44'/165'/0'", {
   *   representative: "xrb_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
   *   balance: "100000000000000000000000000000000",
   *   sourceBlock: "06B95C8A7EC4116E5BD907CD6DC65D310E065992A2E1D02F337D1A8308DEBC14"
   * }).then(o => o.signature)
   *
   * @example <caption>Sending funds</caption>
   * nano.signBlock("44'/165'/0'", {
   *   previousBlock: "991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948",
   *   representative: "xrb_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
   *   balance: "100000000000000000000000000000000",
   *   recipient: "nano_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k"
   * }).then(o => o.signature)
   */
  async signBlock(
    path: string,
    blockData: BlockData
  ): Promise<{|
    blockHash: string,
    signature: string
  |}> {
    const b = blockData;
    const { representativePublicKey, recipientPublicKey } = processBlockData(b);

    const bipPath = BIPPath.fromString(path).toPathArray();

    const cla = 0xa1;
    const ins = 0x04;
    const p1 = 0x00;
    let p2 = 0x00;
    if (b.recipient && b.recipient.startsWith("xrb_")) p2 |= 0x01;
    if (b.representative.startsWith("xrb_")) p2 |= 0x02;

    let size = 1 + 4 * bipPath.length; // bipPath
    size += 32; // previousBlock
    size += 32; // sourceBlock / recipient
    size += 32; // representative
    size += 16; // balance

    let ptr = 0;
    let buf = Buffer.alloc(size);

    buf.writeUInt8(bipPath.length, ptr);
    ptr += 1;
    bipPath.forEach((segment, index) => {
      buf.writeUInt32BE(segment, ptr);
      ptr += 4;
    });

    if (b.previousBlock) {
      ptr += buf.write(b.previousBlock, ptr, undefined, "hex");
    } else {
      ptr += 32;
    }

    if (b.sourceBlock) {
      ptr += buf.write(b.sourceBlock, ptr, undefined, "hex");
    } else if (recipientPublicKey) {
      ptr += recipientPublicKey.copy(buf, ptr);
    } else {
      ptr += 32;
    }

    ptr += representativePublicKey.copy(buf, ptr);
    ptr += buf.write(encodeBalance(b.balance), ptr, undefined, "hex");

    buf = await this.transport.send(cla, ins, p1, p2, buf);
    ptr = 0;

    const result = {};
    ptr += 32;
    const blockHash = buf.slice(ptr - 32, ptr).toString("hex");

    ptr += 64;
    const signature = buf.slice(ptr - 64, ptr).toString("hex");

    return {
      blockHash,
      signature
    };
  }

  /**
   * Cache block in Ledger device memory
   * @param path a path of the account in BIP 32 format
   * @param blockData block data
   * @param signature signature (in hex) of the block
   *
   * @example
   * nano.cacheBlock("44'/165'/0'", {
   *   representative: "xrb_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
   *   balance: "100000000000000000000000000000000",
   *   sourceBlock: "06B95C8A7EC4116E5BD907CD6DC65D310E065992A2E1D02F337D1A8308DEBC14"
   * });
   */
  async cacheBlock(
    path: string,
    blockData: BlockData,
    signature: string
  ): Promise<*> {
    const b = blockData;
    const { representativePublicKey, recipientPublicKey } = processBlockData(b);

    if (signature.length != 128) {
      throw new Error("`signature` must be a 128 character hex string");
    }

    const bipPath = BIPPath.fromString(path).toPathArray();

    const cla = 0xa1;
    const ins = 0x03;
    const p1 = 0x00;
    let p2 = 0x00;

    let size = 1 + 4 * bipPath.length; // bipPath
    size += 32; // previousBlock
    size += 32; // sourceBlock / recipient
    size += 32; // representative
    size += 16; // balance
    size += 64; // balance

    let ptr = 0;
    let buf = Buffer.alloc(size);

    buf.writeUInt8(bipPath.length, ptr);
    ptr += 1;
    bipPath.forEach((segment, index) => {
      buf.writeUInt32BE(segment, ptr);
      ptr += 4;
    });

    if (b.previousBlock) {
      ptr += buf.write(b.previousBlock, ptr, undefined, "hex");
    } else {
      ptr += 32;
    }

    if (b.sourceBlock) {
      ptr += buf.write(b.sourceBlock, ptr, undefined, "hex");
    } else if (recipientPublicKey) {
      ptr += recipientPublicKey.copy(buf, ptr);
    } else {
      ptr += 32;
    }

    ptr += representativePublicKey.copy(buf, ptr);
    ptr += buf.write(encodeBalance(b.balance), ptr, undefined, "hex");
    ptr += buf.write(signature, ptr, undefined, "hex");

    await this.transport.send(cla, ins, p1, p2, buf);
  }
}
