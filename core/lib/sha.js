/*
 * Copyright 2010-2026 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 *
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or
 *   modify it under the terms of the GNU Affero General Public License
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 *
 *   The code in this file is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU
 *   AGPL normally required by section 4, provided you include this license
 *   notice and a URL through which recipients can access the Corresponding
 *   Source.
 */

const H1 = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
const H256 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const K256 = [
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];
const H384 = [
	0xcbbb9d5dc1059ed8n, 0x629a292a367cd507n, 0x9159015a3070dd17n, 0x152fecd8f70e5939n,
	0x67332667ffc00b31n, 0x8eb44a8768581511n, 0xdb0c2e0d64f98fa7n, 0x47b5481dbefa4fa4n
];
const H512 = [
	0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
	0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n
];
const K512 = [
	0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
	0x3956c25bf348b538n, 0x59f111f1b605d019n, 0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
	0xd807aa98a3030242n, 0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
	0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n, 0xc19bf174cf692694n,
	0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n, 0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
	0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
	0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
	0xc6e00bf33da88fc2n, 0xd5a79147930aa725n, 0x06ca6351e003826fn, 0x142929670a0e6e70n,
	0x27b70a8546d22ffcn, 0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
	0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n, 0x92722c851482353bn,
	0xa2bfe8a14cf10364n, 0xa81a664bbc423001n, 0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
	0xd192e819d6ef5218n, 0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
	0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
	0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn, 0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
	0x748f82ee5defb2fcn, 0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
	0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
	0xca273eceea26619cn, 0xd186b8c721c0c207n, 0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
	0x06f067aa72176fban, 0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
	0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
	0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n
];
const MASK_64 = 0xffffffffffffffffn;

export {
	digest
};

function digest(algorithm, data) {
	if (algorithm == "SHA-1") {
		return digestSha1(data);
	} else if (algorithm == "SHA-256") {
		return digestSha256(data);
	} else if (algorithm == "SHA-384") {
		return digestSha512(data, H384, 6);
	} else if (algorithm == "SHA-512") {
		return digestSha512(data, H512, 8);
	} else {
		throw new Error("Unsupported algorithm: " + algorithm);
	}
}

function digestSha1(data) {
	const state = Int32Array.from(H1);
	const schedule = new Int32Array(80);
	const view = padMessage(data, 64);
	for (let blockOffset = 0; blockOffset < view.byteLength; blockOffset += 64) {
		for (let index = 0; index < 16; index++) {
			schedule[index] = view.getUint32(blockOffset + index * 4);
		}
		for (let index = 16; index < 80; index++) {
			const value = schedule[index - 3] ^ schedule[index - 8] ^ schedule[index - 14] ^ schedule[index - 16];
			schedule[index] = (value << 1) | (value >>> 31);
		}
		let [a, b, c, d, e] = state;
		for (let index = 0; index < 80; index++) {
			let mix, constant;
			if (index < 20) {
				mix = (b & c) | (~b & d);
				constant = 0x5a827999;
			} else if (index < 40) {
				mix = b ^ c ^ d;
				constant = 0x6ed9eba1;
			} else if (index < 60) {
				mix = (b & c) | (b & d) | (c & d);
				constant = 0x8f1bbcdc;
			} else {
				mix = b ^ c ^ d;
				constant = 0xca62c1d6;
			}
			const value = (((a << 5) | (a >>> 27)) + mix + e + constant + schedule[index]) | 0;
			e = d;
			d = c;
			c = (b << 30) | (b >>> 2);
			b = a;
			a = value;
		}
		state[0] += a;
		state[1] += b;
		state[2] += c;
		state[3] += d;
		state[4] += e;
	}
	return serializeState32(state);
}

function digestSha256(data) {
	const state = Int32Array.from(H256);
	const schedule = new Int32Array(64);
	const view = padMessage(data, 64);
	for (let blockOffset = 0; blockOffset < view.byteLength; blockOffset += 64) {
		for (let index = 0; index < 16; index++) {
			schedule[index] = view.getUint32(blockOffset + index * 4);
		}
		for (let index = 16; index < 64; index++) {
			const value0 = schedule[index - 15];
			const value1 = schedule[index - 2];
			const sigma0 = rotateRight32(value0, 7) ^ rotateRight32(value0, 18) ^ (value0 >>> 3);
			const sigma1 = rotateRight32(value1, 17) ^ rotateRight32(value1, 19) ^ (value1 >>> 10);
			schedule[index] = schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1;
		}
		let [a, b, c, d, e, f, g, h] = state;
		for (let index = 0; index < 64; index++) {
			const sum1 = rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25);
			const choice = (e & f) ^ (~e & g);
			const value1 = (h + sum1 + choice + K256[index] + schedule[index]) | 0;
			const sum0 = rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22);
			const majority = (a & b) ^ (a & c) ^ (b & c);
			const value2 = (sum0 + majority) | 0;
			h = g;
			g = f;
			f = e;
			e = (d + value1) | 0;
			d = c;
			c = b;
			b = a;
			a = (value1 + value2) | 0;
		}
		state[0] += a;
		state[1] += b;
		state[2] += c;
		state[3] += d;
		state[4] += e;
		state[5] += f;
		state[6] += g;
		state[7] += h;
	}
	return serializeState32(state);
}

function digestSha512(data, initialState, stateLength) {
	const state = Array.from(initialState);
	const schedule = new Array(80);
	const view = padMessage(data, 128);
	for (let blockOffset = 0; blockOffset < view.byteLength; blockOffset += 128) {
		for (let index = 0; index < 16; index++) {
			schedule[index] = (BigInt(view.getUint32(blockOffset + index * 8)) << 32n) | BigInt(view.getUint32(blockOffset + index * 8 + 4));
		}
		for (let index = 16; index < 80; index++) {
			const value0 = schedule[index - 15];
			const value1 = schedule[index - 2];
			const sigma0 = rotateRight64(value0, 1n) ^ rotateRight64(value0, 8n) ^ (value0 >> 7n);
			const sigma1 = rotateRight64(value1, 19n) ^ rotateRight64(value1, 61n) ^ (value1 >> 6n);
			schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) & MASK_64;
		}
		let [a, b, c, d, e, f, g, h] = state;
		for (let index = 0; index < 80; index++) {
			const sum1 = rotateRight64(e, 14n) ^ rotateRight64(e, 18n) ^ rotateRight64(e, 41n);
			const choice = (e & f) ^ (~e & g);
			const value1 = (h + sum1 + choice + K512[index] + schedule[index]) & MASK_64;
			const sum0 = rotateRight64(a, 28n) ^ rotateRight64(a, 34n) ^ rotateRight64(a, 39n);
			const majority = (a & b) ^ (a & c) ^ (b & c);
			const value2 = (sum0 + majority) & MASK_64;
			h = g;
			g = f;
			f = e;
			e = (d + value1) & MASK_64;
			d = c;
			c = b;
			b = a;
			a = (value1 + value2) & MASK_64;
		}
		const values = [a, b, c, d, e, f, g, h];
		values.forEach((value, index) => state[index] = (state[index] + value) & MASK_64);
	}
	const buffer = new ArrayBuffer(stateLength * 8);
	const outputView = new DataView(buffer);
	for (let index = 0; index < stateLength; index++) {
		outputView.setUint32(index * 8, Number(state[index] >> 32n));
		outputView.setUint32(index * 8 + 4, Number(state[index] & 0xffffffffn));
	}
	return buffer;
}

function padMessage(data, blockLength) {
	const paddedLength = Math.ceil((data.length + 1 + blockLength / 8) / blockLength) * blockLength;
	const padded = new Uint8Array(paddedLength);
	padded.set(data);
	padded[data.length] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(paddedLength - 8, Math.floor(data.length / 0x20000000));
	view.setUint32(paddedLength - 4, data.length << 3);
	return view;
}

function rotateRight32(value, count) {
	return (value >>> count) | (value << (32 - count));
}

function rotateRight64(value, count) {
	return ((value >> count) | (value << (64n - count))) & MASK_64;
}

function serializeState32(state) {
	const buffer = new ArrayBuffer(state.length * 4);
	const view = new DataView(buffer);
	state.forEach((value, index) => view.setUint32(index * 4, value));
	return buffer;
}
