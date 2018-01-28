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
   * Get RaiBlocks address for a given BIP 32 path.
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

    let buf = new Buffer(1 + bipPath.length * 4);
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
}
