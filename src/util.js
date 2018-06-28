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

import nanoBase32 from "nano-base32";
import { blake2b } from "blakejs";
import bigInt from "big-integer";

export function decodeAddress(
  address: string,
  allowedPrefixes: string[]
): ?Buffer {
  for (var i = 0; i < allowedPrefixes.length; i++) {
    const prefix = allowedPrefixes[i];
    if (address.startsWith(prefix)) {
      address = address.substr(prefix.length);
      break;
    }
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
 * encodeBalance("14000000000000000000000000") == "00000000000B949D854F34FECE000000"
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
 * decodeBalance("00000000000B949D854F34FECE000000") == "14000000000000000000000000"
 */
export function decodeBalance(value: string): string {
  return bigInt(value, 16).toString();
}
