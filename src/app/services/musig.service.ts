import { Injectable } from '@angular/core';
import {UtilService} from './util.service';
import { NotificationService } from './notification.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import * as nanocurrency from 'nanocurrency';
import { environment } from 'environments/environment';
const base32 = require('nano-base32');

// WebAssembly exports used by the existing musig-nano ABI.
// Every pointer and length is represented as an i32 in JavaScript.
interface MusigWasmExports {
  memory: WebAssembly.Memory;
  musig_malloc(length: number): number;
  musig_free(pointer: number): void;
  musig_free_stage0(stagePointer: number): void;
  musig_aggregate_public_keys(pubkeyPointers: number, count: number, output: number, aggregatedKey: number): void;
  musig_stage0(output: number, publicKey: number): number;
  musig_stage1(stagePointer: number, privateKey: number, pubkeyPointers: number, pubkeyCount: number,
    flags: number, blockHash: number, hashLength: number, inputPointers: number, inputCount: number,
    errorOutput: number, optionalOutput: number | null, output: number): number;
  musig_stage2(stagePointer: number, inputPointers: number, inputCount: number, errorOutput: number, output: number): number;
  musig_stage3(stagePointer: number, inputPointers: number, inputCount: number, errorOutput: number, output: number): number;
}

interface AggregateResult {
  multisig: string;
  pubkey: Uint8Array;
}

interface MultiSignResult {
  outbuf: Uint8Array;
  stage: number;
  multisig: string;
}

type AggregateCallback = (pubkeyPointers: number, count: number) => void;

@Injectable({
  providedIn: 'root'
})
export class MusigService {
  // The multisig wasm library can be validated by running build-or-validate_musig_wasm.sh
  private wasmURL = environment.desktop ?
    '../../../resources/app.asar/dist/assets/lib/musig-nano/musig_nano.wasm.b64' : '../../../assets/lib/musig-nano/musig_nano.wasm.b64';

  wasm: MusigWasmExports | null = null;
  wasmErrors = ['No error', 'Internal error', 'Invalid parameter(s)', 'Invalid Participant Input'];
  musigStagePtr: number | null | undefined = null;
  musigStageNum: number | null | undefined = null;
  savedPublicKeys: string[] = [];

  constructor(
    private util: UtilService,
    private notificationService: NotificationService,
    private http: HttpClient,
  ) {
    // Read the wasm file for multisig
    this.getWASM().subscribe(data => {
      const wasmString = atob(data);
      const wasmBytes = new Uint8Array(wasmString.length);
      for (let i = 0; i < wasmString.length; i++) {
        wasmBytes[i] = wasmString.charCodeAt(i);
      }

      const imports = {
        wasi_snapshot_preview1: {
          fd_write: (fd: number, iovs: number, errno: number, nwritten: number) => {
            console.error('fd_write called: unimplemented');
            return 0;
          },
          proc_exit: () => {
            console.error('proc_exit called: unimplemented');
            return 0;
          },
          environ_sizes_get: () => {
            console.error('environ_sizes_get called: unimplemented');
            return 0;
          },
          environ_get: () => {
            console.error('environ_get called: unimplemented');
            return 0;
          },
          random_get: (ptr: number, len: number) => {
            crypto.getRandomValues(new Uint8Array(this.requireWasm().memory.buffer, ptr, len));
            return 0;
          }
        },
        wasi_unstable: {
          random_get: (ptr: number, len: number) => {
            crypto.getRandomValues(new Uint8Array(this.requireWasm().memory.buffer, ptr, len));
            return 0;
          }
        },
      };
      WebAssembly.instantiate(wasmBytes, imports).then(w => {
        this.wasm = w.instance.exports as unknown as MusigWasmExports;
      }).catch(console.error);
    });
  }

  private requireWasm(): MusigWasmExports {
    if (this.wasm === null) {
      throw new Error('Multisig WebAssembly is not loaded');
    }
    return this.wasm;
  }

  // Load multisig rust library from local file via http
  getWASM(): Observable<string> {
    return this.http.get(this.wasmURL, {headers: new HttpHeaders({
      'Accept': 'text/html, application/xhtml+xml, */*',
      'Content-Type': 'application/x-www-form-urlencoded'
    }),
    responseType: 'text'});
  }

  resetMusig() {
    this.musigStagePtr = null;
    this.musigStageNum = null;
    this.savedPublicKeys = [];
  }

  copyToWasm(bytes: Uint8Array, ptr: number | null = null): number {
    const wasm = this.requireWasm();
    if (!ptr) {
      ptr = wasm.musig_malloc(bytes.length);
    }
    const buf = new Uint8Array(wasm.memory.buffer, ptr, bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      buf[i] = bytes[i];
    }
    return ptr;
  }
  copyFromWasm(ptr: number, length: number): Uint8Array {
    const memory = new Uint8Array(this.requireWasm().memory.buffer);
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = memory[ptr + i];
    }
    return out;
  }

  wasmError(errCode: number): never {
    throw new Error('Multisig error ' + errCode + ': ' + this.wasmErrors[errCode]);
  }

  runAggregate(storedAccounts: string[], runWithPubkeys: AggregateCallback | null = null): AggregateResult | null {
    try {
      return this.aggregate(storedAccounts, runWithPubkeys);
    } catch (err) {
      this.notificationService.sendError(String(err), {length: 0});
      return null;
    }
  }

  runMultiSign(privateKey: string, blockHash: string, inputMultisigData: string[]): MultiSignResult | null {
    try {
      return this.multiSign(privateKey, blockHash, inputMultisigData);
    } catch (err) {
      this.notificationService.sendError(String(err), {length: 0});
      return null;
    }
  }

  aggregate(storedAccounts: string[] | '', runWithPubkeys: AggregateCallback | null = null): AggregateResult {
    const wasm = this.requireWasm();
    let addresses: string[] = [];
    if (runWithPubkeys && this.savedPublicKeys?.length > 1) {
      for (const pubKey of this.savedPublicKeys) {
        addresses.push(nanocurrency.deriveAddress(pubKey, {useNanoPrefix: true}));
      }
    } else {
      if (!Array.isArray(storedAccounts)) {
        throw new Error('Must have at least 2 participating addresses!');
      }
      addresses = storedAccounts;
      if (addresses.length < 2) {
          throw new Error('Must have at least 2 participating addresses!');
      }
    }
    const pubkeys = [];
    for (let address of addresses) {
      address = address.trim();
      if (!address.startsWith('xrb_') && !address.startsWith('nano_')) {
        throw new Error('Nano addresses must start with xrb_ or nano_');
      }
      address = address.split('_', 2)[1];
      try {
        const bytes = base32.decode(address);
        if (bytes.length !== 37) {
          throw new Error('Wrong nano address length');
        }
        const pubkey = bytes.subarray(0, 32);
        const checksum_ = this.util.account.getAccountChecksum(pubkey);
        if (!this.util.array.equalArrays(bytes.subarray(32), checksum_)) {
          throw new Error('Invalid nano address checksum');
        }
        pubkeys.push(pubkey);
      } catch (err_) {
          console.error(String(err_));
          throw new Error('Invalid nano address (bad character?)');
      }
    }
    const pubkeyPtrs = wasm.musig_malloc(pubkeys.length * 4);
    const pubkeyPtrsBuf = new Uint32Array(wasm.memory.buffer, pubkeyPtrs, pubkeys.length);
    for (let i = 0; i < pubkeys.length; i++) {
      pubkeyPtrsBuf[i] = this.copyToWasm(pubkeys[i]);
    }
    const outPtr = wasm.musig_malloc(33);
    const outBuf = new Uint8Array(wasm.memory.buffer, outPtr, 33);
    outBuf[0] = 0;
    wasm.musig_aggregate_public_keys(pubkeyPtrs, pubkeys.length, outPtr, outPtr + 1);
    if (runWithPubkeys) runWithPubkeys(pubkeyPtrs, pubkeys.length);
    for (let i = 0; i < pubkeyPtrsBuf.length; i++) {
      wasm.musig_free(pubkeyPtrsBuf[i]);
    }
    wasm.musig_free(pubkeyPtrs);
    const err = outBuf[0];
    if (err !== 0) {
      wasm.musig_free(outPtr);
        throw this.wasmError(err);
    }
    const aggPubkey = outBuf.subarray(1).slice();
    const checksum = this.util.account.getAccountChecksum(aggPubkey);
    const fullAddress = new Uint8Array(37);
    for (let i = 0; i < 32; i++) {
      fullAddress[i] = aggPubkey[i];
    }
    for (let i = 0; i < 5; i++) {
      fullAddress[32 + i] = checksum[i];
    }
    const fullAddressFinal = 'nano_' + base32.encode(fullAddress);
    console.log('Multisig Account: ' + fullAddressFinal);
    wasm.musig_free(outPtr);
    return {'multisig': fullAddressFinal, 'pubkey': aggPubkey};
  }

  multiSign(privateKey: string, blockHash: string, inputMultisigData: string[]): MultiSignResult {
    const wasm = this.requireWasm();
    let multisigAccount = '';
    // Stage 0 (init)
    const activeStagePtr = this.musigStagePtr;
    if (!activeStagePtr) {
      if (!this.util.nano.isValidHash(privateKey)) {
        throw new Error('Invalid private key');
      }
      if (!this.util.nano.isValidHash(blockHash)) {
        throw new Error('Invalid block hash');
      }
      const outPtr = wasm.musig_malloc(65);
      const outBuf = new Uint8Array(wasm.memory.buffer, outPtr, 65);
      outBuf[0] = 0;
      try {
        this.musigStagePtr = wasm.musig_stage0(outPtr, outPtr + 33);
        this.musigStageNum = 0;
      } catch (err_) {
        if (this.musigStagePtr) {
          wasm.musig_free_stage0(this.musigStagePtr);
        }
        this.musigStagePtr = undefined;
        this.musigStageNum = undefined;
        throw err_;
      }
      const err = outBuf[0];
      if (err !== 0) {
        this.musigStagePtr = undefined;
        this.musigStageNum = undefined;
        wasm.musig_free(outPtr);
        throw this.wasmError(err);
      }

      const finalBuf = outBuf;
      wasm.musig_free(outPtr);
      return {'outbuf': finalBuf, 'stage': this.musigStageNum, 'multisig': multisigAccount};

      // Further steps
    } else {
      const protocolInputs = [];
      // only use the first part of the data
      for (const input of inputMultisigData) {
        protocolInputs.push(input.substring(2, 66).toLowerCase());
      }
      const protocolInputPtrs = wasm.musig_malloc(protocolInputs.length * 4);
      const protocolInputPtrsBuf = new Uint32Array(wasm.memory.buffer, protocolInputPtrs, protocolInputs.length);
      for (let i = 0; i < protocolInputs.length; i++) {
          protocolInputPtrsBuf[i] = this.copyToWasm(this.util.hex.toUint8(protocolInputs[i]));
      }

      let privateKeyPtr: number | undefined;
      if (this.musigStageNum === 0) {
        privateKeyPtr = this.copyToWasm(this.util.hex.toUint8(privateKey));
      }

      const outLen = (this.musigStageNum === 2) ? 65 : 33;
      const outPtr = wasm.musig_malloc(outLen);
      const outBuf = new Uint8Array(wasm.memory.buffer, outPtr, outLen);
      outBuf[0] = 0;
      let newStagePtr: number | undefined;

      if (this.musigStageNum === 0) {
        // Extract public keys from the participants
        this.savedPublicKeys = [];
        // only use the second part of the data
        for (const input of inputMultisigData) {
          this.savedPublicKeys.push(input.substring(66, 130).toLowerCase());
        }
        // Add the public key from self
        const pub = nanocurrency.derivePublicKey(privateKey);
        if (this.savedPublicKeys.includes(pub.toLowerCase())) {
          throw new Error('You must use different private keys for each participant!');
        }
        this.savedPublicKeys.push(pub);

        const blockhash = this.util.hex.toUint8(blockHash);
        const blockhashPtr = this.copyToWasm(blockhash);
        if (privateKeyPtr === undefined) {
          throw new Error('Multisig private key pointer is missing');
        }
        const result = this.aggregate('', (pubkeys, pubkeysLen) => {
          const flags = 0; // Set to 1 if private key is a raw/expanded scalar (unusual)
          newStagePtr = wasm.musig_stage1(activeStagePtr, privateKeyPtr, pubkeys, pubkeysLen, flags,
            blockhashPtr, blockhash.length, protocolInputPtrs, protocolInputs.length, outPtr, null, outPtr + 1);
        });
        multisigAccount = result?.multisig;
        this.musigStageNum = 0;
        wasm.musig_free(privateKeyPtr);
        wasm.musig_free(blockhashPtr);

      } else if (this.musigStageNum === 1) {
          newStagePtr = wasm.musig_stage2(activeStagePtr, protocolInputPtrs, protocolInputs.length, outPtr, outPtr + 1);
      } else if (this.musigStageNum === 2) {
          newStagePtr = wasm.musig_stage3(activeStagePtr, protocolInputPtrs, protocolInputs.length, outPtr, outPtr + 1);
      } else {
        wasm.musig_free(outPtr);
          throw new Error('Unexpected musigStageNum ' + this.musigStageNum);
      }
      const err = outBuf[0];
      if (err !== 0) {
        wasm.musig_free(outPtr);
          throw this.wasmError(err);
      }
      if (newStagePtr === undefined || this.musigStageNum == null) {
        throw new Error('Multisig stage did not produce a valid state');
      }
      this.musigStagePtr = newStagePtr;
      this.musigStageNum++;

      const finalBuf = new Uint8Array(outBuf); // make a copy to avoid pointer being reset by musig_free
      wasm.musig_free(outPtr);
      return {'outbuf': finalBuf, 'stage': this.musigStageNum, 'multisig': multisigAccount};
    }
  }
}
