/********************************************************************************
 *   LibNano Ledger JS API
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
import { decodeAddress, encodeBalance } from "./util";

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

/**
 * Coin configuration object used to pass coin implementation details
 * to all the common API functions that the coins share.
 */
export type CoinConfig = {
  coinName: string,
  addressPrimaryPrefix: string,
  addressSecondaryPrefix: string
};

function addressPrefixes(coin: CoinConfig): string[] {
  return [coin.addressPrimaryPrefix, coin.addressSecondaryPrefix];
}

function badAddressReason(c: CoinConfig, field: string): string {
  const addrLen = 60;
  const pre1 = c.addressPrimaryPrefix;
  const pre2 = c.addressSecondaryPrefix;
  let msg;
  if (pre1 == pre2) {
    msg = `must be a ${addrLen + pre1.length} character ${pre1} address`;
  } else {
    msg =
      `must be either a ${addrLen + pre1.length} character ${pre1} address ` +
      `or a ${addrLen + pre2.length} character ${pre2} address`;
  }
  return `\`${field}\` ${msg}`;
}

function processBlockData(
  c: CoinConfig,
  b: BlockData
): {|
  representativePublicKey: Buffer,
  recipientPublicKey: ?Buffer
|} {
  if (b.previousBlock && b.previousBlock.length != 64) {
    throw new Error("`previousBlock` must be a 64 character hex string");
  }
  const representativePublicKey = decodeAddress(
    b.representative,
    addressPrefixes(c)
  );
  if (!representativePublicKey) {
    throw new Error(badAddressReason(c, "representative"));
  }
  if (!/[0-9]+/.test(b.balance)) {
    throw new Error("`balance` must be a number");
  }
  if (b.sourceBlock && b.sourceBlock.length != 64) {
    throw new Error("`sourceBlock` must be a 64 character hex string");
  }
  const recipientPublicKey = b.recipient
    ? decodeAddress(b.recipient, addressPrefixes(c))
    : null;
  if (b.recipient && !recipientPublicKey) {
    throw new Error(badAddressReason(c, "recipient"));
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

export async function getAppConfiguration(
  coin: CoinConfig,
  transport: Transport<*>
): Promise<{|
  version: string,
  coinName: string
|}> {
  const cla = 0xa1;
  const ins = 0x01;
  const p1 = 0x00;
  const p2 = 0x00;

  let size = 0;
  let buf = Buffer.alloc(size);

  buf = await transport.send(cla, ins, p1, p2, buf);
  let ptr = 0;

  const versionMajor = buf.readUInt8(ptr);
  ptr += 1;
  const versionMinor = buf.readUInt8(ptr);
  ptr += 1;
  const versionPatch = buf.readUInt8(ptr);
  ptr += 1;

  let coinName = "";
  if (ptr < buf.length) {
    const coinNameLength = buf.readUInt8(ptr);
    ptr += 1 + coinNameLength;
    coinName = buf.slice(ptr - coinNameLength, ptr).toString("ascii");
  } else if (versionMajor == 1 && versionMinor == 0 && versionPatch == 0) {
    coinName = "Nano";
  }

  return {
    version: "" + versionMajor + "." + versionMinor + "." + versionPatch,
    coinName
  };
}

export async function getAddress(
  coin: CoinConfig,
  transport: Transport<*>,
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

  buf = await transport.send(cla, ins, p1, p2, buf);
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

export async function signBlock(
  coin: CoinConfig,
  transport: Transport<*>,
  path: string,
  blockData: BlockData
): Promise<{|
  blockHash: string,
  signature: string
|}> {
  const b = blockData;
  const { representativePublicKey, recipientPublicKey } = processBlockData(
    coin,
    b
  );

  const bipPath = BIPPath.fromString(path).toPathArray();

  const cla = 0xa1;
  const ins = 0x04;
  const p1 = 0x00;
  let p2 = 0x00;
  if (coin.addressPrimaryPrefix != coin.addressSecondaryPrefix) {
    if (b.recipient && b.recipient.startsWith(coin.addressSecondaryPrefix)) {
      p2 |= 0x01;
    }
    if (b.representative.startsWith(coin.addressSecondaryPrefix)) {
      p2 |= 0x02;
    }
  }

  let size = 1 + 4 * bipPath.length; // bipPath
  size += 32; // previousBlock
  size += 32; // sourceBlock / recipient
  size += 32; // representative
  size += 16; // balance

  let ptr = 0;
  let buf = Buffer.alloc(size);

  buf.writeUInt8(bipPath.length, ptr);
  ptr += 1;
  bipPath.forEach((segment, _) => {
    buf.writeUInt32BE(segment, ptr);
    ptr += 4;
  });

  if (b.previousBlock) {
    ptr += buf.write(b.previousBlock, ptr, buf.length - ptr, "hex");
  } else {
    ptr += 32;
  }

  if (b.sourceBlock) {
    ptr += buf.write(b.sourceBlock, ptr, buf.length - ptr, "hex");
  } else if (recipientPublicKey) {
    ptr += recipientPublicKey.copy(buf, ptr);
  } else {
    ptr += 32;
  }

  ptr += representativePublicKey.copy(buf, ptr);
  ptr += buf.write(encodeBalance(b.balance), ptr, buf.length - ptr, "hex");

  buf = await transport.send(cla, ins, p1, p2, buf);
  ptr = 0;

  ptr += 32;
  const blockHash = buf.slice(ptr - 32, ptr).toString("hex");

  ptr += 64;
  const signature = buf.slice(ptr - 64, ptr).toString("hex");

  return {
    blockHash,
    signature
  };
}

export async function cacheBlock(
  coin: CoinConfig,
  transport: Transport<*>,
  path: string,
  blockData: BlockData,
  signature: string
): Promise<*> {
  const b = blockData;
  const { representativePublicKey, recipientPublicKey } = processBlockData(
    coin,
    b
  );

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
  size += 64; // signature

  let ptr = 0;
  let buf = Buffer.alloc(size);

  buf.writeUInt8(bipPath.length, ptr);
  ptr += 1;
  bipPath.forEach((segment, _) => {
    buf.writeUInt32BE(segment, ptr);
    ptr += 4;
  });

  if (b.previousBlock) {
    ptr += buf.write(b.previousBlock, ptr, buf.length - ptr, "hex");
  } else {
    ptr += 32;
  }

  if (b.sourceBlock) {
    ptr += buf.write(b.sourceBlock, ptr, buf.length - ptr, "hex");
  } else if (recipientPublicKey) {
    ptr += recipientPublicKey.copy(buf, ptr);
  } else {
    ptr += 32;
  }

  ptr += representativePublicKey.copy(buf, ptr);
  ptr += buf.write(encodeBalance(b.balance), ptr, buf.length - ptr, "hex");
  ptr += buf.write(signature, ptr, buf.length - ptr, "hex");

  await transport.send(cla, ins, p1, p2, buf);
}

/**
 * Base class for all Nano-family coin APIs to derive from.
 */
export class BaseAPI {
  transport: Transport<*>;
  _appCoin: ?string;

  /**
   * The coin configuration object for the current coin.
   */
  coin: CoinConfig;

  constructor(transport: Transport<*>, coin: CoinConfig) {
    transport.setScrambleKey("mRB");
    this.transport = transport;
    this.coin = coin;
  }

  _assertCorrectCoin() {
    const appCoin = this._appCoin;
    if (typeof appCoin === "string" && appCoin != this.coin.coinName) {
      throw new Error(
        `Expected ${this.coin.coinName} app to be open, ` +
          `found ${appCoin} app open instead`
      );
    }
  }

  /**
   * Get Nano-family application configuration. The returned coinName should be
   * verified to match that of `inst.coin.coinName`. If it doesn't, then the user
   * has the wrong application open on their device and other API calls will fail.
   * @return an object with a version and the coin name
   * @example
   * inst.getAppConfiguration().then(c => {
   *   if (c.coinName != inst.coin.coinName) { throw new Error("Wrong coin app"); }
   *   return c.version;
   * })
   */
  async getAppConfiguration(): Promise<{|
    version: string,
    coinName: string
  |}> {
    let appConf = await getAppConfiguration(this.coin, this.transport);
    this._appCoin = appConf.coinName;
    return appConf;
  }
}
