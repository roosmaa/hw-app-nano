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
import type { BlockData } from "./api";
import { BaseAPI, getAddress, signBlock, cacheBlock } from "./api";

/**
 * Banano API
 *
 * @example
 * import { Banano } from "hw-app-nano";
 * const ban = new Banano(transport);
 */
export default class Banano extends BaseAPI {
  constructor(transport: Transport<*>) {
    super(transport, {
      coinName: "Banano",
      addressPrimaryPrefix: "ban_",
      addressSecondaryPrefix: "ban_"
    });
  }

  /**
   * Get Banano address for the given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolDisplay display the address on the device
   * @return an object with a publicKey and address
   * @example
   * ban.getAddress("44'/198'/0'").then(o => o.address)
   */
  async getAddress(
    path: string,
    boolDisplay?: boolean
  ): Promise<{|
    publicKey: string,
    address: string
  |}> {
    this._assertCorrectCoin();
    return await getAddress(this.coin, this.transport, path, boolDisplay);
  }

  /**
   * Generate a signature for a block
   * @param path a path of the account in BIP 32 format
   * @param blockData block data to hash and sign
   *
   * @example <caption>Opening an account</caption>
   * ban.signBlock("44'/198'/0'", {
   *   representative: "ban_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
   *   balance: "100000000000000000000000000000000",
   *   sourceBlock: "06B95C8A7EC4116E5BD907CD6DC65D310E065992A2E1D02F337D1A8308DEBC14"
   * }).then(o => o.signature)
   *
   * @example <caption>Sending funds</caption>
   * ban.signBlock("44'/198'/0'", {
   *   previousBlock: "991CF190094C00F0B68E2E5F75F6BEE95A2E0BD93CEAA4A6734DB9F19B728948",
   *   representative: "ban_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
   *   balance: "100000000000000000000000000000000",
   *   recipient: "ban_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k"
   * }).then(o => o.signature)
   */
  async signBlock(
    path: string,
    blockData: BlockData
  ): Promise<{|
    blockHash: string,
    signature: string
  |}> {
    this._assertCorrectCoin();
    return signBlock(this.coin, this.transport, path, blockData);
  }

  /**
   * Cache block in Ledger device memory
   * @param path a path of the account in BIP 32 format
   * @param blockData block data
   * @param signature signature (in hex) of the block
   *
   * @example
   * ban.cacheBlock("44'/198'/0'", {
   *   representative: "ban_3hd4ezdgsp15iemx7h81in7xz5tpxi43b6b41zn3qmwiuypankocw3awes5k",
   *   balance: "100000000000000000000000000000000",
   *   sourceBlock: "06B95C8A7EC4116E5BD907CD6DC65D310E065992A2E1D02F337D1A8308DEBC14"
   * });
   */
  async cacheBlock(
    path: string,
    blockData: BlockData,
    signature: string
  ): Promise<*> {
    this._assertCorrectCoin();
    return cacheBlock(this.coin, this.transport, path, blockData, signature);
  }
}
