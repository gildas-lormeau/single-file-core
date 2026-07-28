const { Array, Object, String, Number, BigInt, Math, Date, Map, Set, Response, URL, Error, Uint8Array, Uint16Array, Uint32Array, DataView, Blob, Promise, TextEncoder, TextDecoder, document, crypto, btoa, TransformStream, ReadableStream, WritableStream, CompressionStream, DecompressionStream, navigator, Worker } = typeof globalThis !== 'undefined' ? globalThis : this || self;

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const MAX_32_BITS = 0xffffffff;
const MAX_16_BITS = 0xffff;
const COMPRESSION_METHOD_DEFLATE = 0x08;
const COMPRESSION_METHOD_STORE = 0x00;
const COMPRESSION_METHOD_AES = 0x63;

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const SPLIT_ZIP_FILE_SIGNATURE = 0x08074b50;
const DATA_DESCRIPTOR_RECORD_SIGNATURE = SPLIT_ZIP_FILE_SIGNATURE;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIR_SIGNATURE = 0x06064b50;
const ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIGNATURE = 0x07064b50;
const END_OF_CENTRAL_DIR_LENGTH = 22;
const ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH = 20;
const ZIP64_END_OF_CENTRAL_DIR_LENGTH = 56;
const ZIP64_END_OF_CENTRAL_DIR_TOTAL_LENGTH = END_OF_CENTRAL_DIR_LENGTH + ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH + ZIP64_END_OF_CENTRAL_DIR_LENGTH;

const EXTRAFIELD_TYPE_ZIP64 = 0x0001;
const EXTRAFIELD_TYPE_AES = 0x9901;
const EXTRAFIELD_TYPE_NTFS = 0x000a;
const EXTRAFIELD_TYPE_NTFS_TAG1 = 0x0001;
const EXTRAFIELD_TYPE_EXTENDED_TIMESTAMP = 0x5455;
const EXTRAFIELD_TYPE_UNICODE_PATH = 0x7075;
const EXTRAFIELD_TYPE_UNICODE_COMMENT = 0x6375;
const EXTRAFIELD_TYPE_USDZ = 0x1986;

const BITFLAG_ENCRYPTED = 0x01;
const BITFLAG_LEVEL = 0x06;
const BITFLAG_DATA_DESCRIPTOR = 0x0008;
const BITFLAG_LANG_ENCODING_FLAG = 0x0800;
const FILE_ATTR_MSDOS_DIR_MASK = 0x10;

const VERSION_DEFLATE = 0x14;
const VERSION_ZIP64 = 0x2D;
const VERSION_AES = 0x33;

const DIRECTORY_SIGNATURE = "/";

const MAX_DATE = new Date(2107, 11, 31);
const MIN_DATE = new Date(1980, 0, 1);

const UNDEFINED_VALUE = undefined;
const UNDEFINED_TYPE = "undefined";
const FUNCTION_TYPE = "function";

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


class StreamAdapter {

	constructor(Codec) {
		return class extends TransformStream {
			constructor(_format, options) {
				const codec = new Codec(options);
				super({
					transform(chunk, controller) {
						controller.enqueue(codec.append(chunk));
					},
					flush(controller) {
						const chunk = codec.flush();
						if (chunk) {
							controller.enqueue(chunk);
						}
					}
				});
			}
		};
	}
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


const MINIMUM_CHUNK_SIZE = 64;
let maxWorkers = 2;
try {
	if (typeof navigator != UNDEFINED_TYPE && navigator.hardwareConcurrency) {
		maxWorkers = navigator.hardwareConcurrency;
	}
} catch (_error) {
	// ignored
}
const DEFAULT_CONFIGURATION = {
	chunkSize: 512 * 1024,
	maxWorkers,
	terminateWorkerTimeout: 5000,
	useWebWorkers: true,
	useCompressionStream: true,
	workerScripts: UNDEFINED_VALUE,
	CompressionStreamNative: typeof CompressionStream != UNDEFINED_TYPE && CompressionStream,
	DecompressionStreamNative: typeof DecompressionStream != UNDEFINED_TYPE && DecompressionStream
};

const config = Object.assign({}, DEFAULT_CONFIGURATION);

function getConfiguration() {
	return config;
}

function getChunkSize(config) {
	return Math.max(config.chunkSize, MINIMUM_CHUNK_SIZE);
}

function configure(configuration) {
	const {
		baseURL,
		chunkSize,
		maxWorkers,
		terminateWorkerTimeout,
		useCompressionStream,
		useWebWorkers,
		Deflate,
		Inflate,
		CompressionStream,
		DecompressionStream,
		workerScripts
	} = configuration;
	setIfDefined("baseURL", baseURL);
	setIfDefined("chunkSize", chunkSize);
	setIfDefined("maxWorkers", maxWorkers);
	setIfDefined("terminateWorkerTimeout", terminateWorkerTimeout);
	setIfDefined("useCompressionStream", useCompressionStream);
	setIfDefined("useWebWorkers", useWebWorkers);
	if (Deflate) {
		config.CompressionStream = new StreamAdapter(Deflate);
	}
	if (Inflate) {
		config.DecompressionStream = new StreamAdapter(Inflate);
	}
	setIfDefined("CompressionStream", CompressionStream);
	setIfDefined("DecompressionStream", DecompressionStream);
	if (workerScripts !== UNDEFINED_VALUE) {
		const { deflate, inflate } = workerScripts;
		if (deflate || inflate) {
			if (!config.workerScripts) {
				config.workerScripts = {};
			}
		}
		if (deflate) {
			if (!Array.isArray(deflate)) {
				throw new Error("workerScripts.deflate must be an array");
			}
			config.workerScripts.deflate = deflate;
		}
		if (inflate) {
			if (!Array.isArray(inflate)) {
				throw new Error("workerScripts.inflate must be an array");
			}
			config.workerScripts.inflate = inflate;
		}
	}
}

function setIfDefined(propertyName, propertyValue) {
	if (propertyValue !== UNDEFINED_VALUE) {
		config[propertyName] = propertyValue;
	}
}

function e(e){const t=()=>URL.createObjectURL(new Blob(['const{Array:e,Object:t,Number:n,Math:s,Error:r,Uint8Array:a,Uint16Array:o,Uint32Array:i,Int32Array:c,Map:l,DataView:u,Promise:h,TextEncoder:p,crypto:f,postMessage:d,TransformStream:g,ReadableStream:w,WritableStream:y,CompressionStream:m,DecompressionStream:_}=self,b=void 0,S="undefined",v="function";class k{constructor(e){return class extends g{constructor(t,n){const s=new e(n);super({transform(e,t){t.enqueue(s.append(e))},flush(e){const t=s.flush();t&&e.enqueue(t)}})}}}}const z=[];for(let e=0;256>e;e++){let t=e;for(let e=0;8>e;e++)1&t?t=t>>>1^3988292384:t>>>=1;z[e]=t}class C{constructor(e){this.crc=e||-1}append(e){let t=0|this.crc;for(let n=0,s=0|e.length;s>n;n++)t=t>>>8^z[255&(t^e[n])];this.crc=t}get(){return~this.crc}}class A extends g{constructor(){let e;const t=new C;super({transform(e,n){t.append(e),n.enqueue(e)},flush(){const n=new a(4);new u(n.buffer).setUint32(0,t.get()),e.value=n}}),e=this}}const q={concat(e,t){if(0===e.length||0===t.length)return e.concat(t);const n=e[e.length-1],s=q.getPartial(n);return 32===s?e.concat(t):q._shiftRight(t,s,0|n,e.slice(0,e.length-1))},bitLength(e){const t=e.length;if(0===t)return 0;const n=e[t-1];return 32*(t-1)+q.getPartial(n)},clamp(e,t){if(32*e.length<t)return e;const n=(e=e.slice(0,s.ceil(t/32))).length;return t&=31,n>0&&t&&(e[n-1]=q.partial(t,e[n-1]&2147483648>>t-1,1)),e},partial:(e,t,n)=>32===e?t:(n?0|t:t<<32-e)+1099511627776*e,getPartial:e=>s.round(e/1099511627776)||32,_shiftRight(e,t,n,s){for(void 0===s&&(s=[]);t>=32;t-=32)s.push(n),n=0;if(0===t)return s.concat(e);for(let r=0;r<e.length;r++)s.push(n|e[r]>>>t),n=e[r]<<32-t;const r=e.length?e[e.length-1]:0,a=q.getPartial(r);return s.push(q.partial(t+a&31,t+a>32?n:s.pop(),1)),s}},I={bytes:{fromBits(e){const t=q.bitLength(e)/8,n=new a(t);let s;for(let r=0;t>r;r++)3&r||(s=e[r/4]),n[r]=s>>>24,s<<=8;return n},toBits(e){const t=[];let n,s=0;for(n=0;n<e.length;n++)s=s<<8|e[n],3&~n||(t.push(s),s=0);return 3&n&&t.push(q.partial(8*(3&n),s)),t}}},R=class{constructor(e){const t=this;t.blockSize=512,t._init=[1732584193,4023233417,2562383102,271733878,3285377520],t._key=[1518500249,1859775393,2400959708,3395469782],e?(t._h=e._h.slice(0),t._buffer=e._buffer.slice(0),t._length=e._length):t.reset()}reset(){const e=this;return e._h=e._init.slice(0),e._buffer=[],e._length=0,e}update(e){const t=this;"string"==typeof e&&(e=I.utf8String.toBits(e));const n=t._buffer=q.concat(t._buffer,e),s=t._length,a=t._length=s+q.bitLength(e);if(a>9007199254740991)throw new r("Cannot hash more than 2^53 - 1 bits");const o=new i(n);let c=0;for(let e=t.blockSize+s-(t.blockSize+s&t.blockSize-1);a>=e;e+=t.blockSize)t._block(o.subarray(16*c,16*(c+1))),c+=1;return n.splice(0,16*c),t}finalize(){const e=this;let t=e._buffer;const n=e._h;t=q.concat(t,[q.partial(1,1)]);for(let e=t.length+2;15&e;e++)t.push(0);for(t.push(s.floor(e._length/4294967296)),t.push(0|e._length);t.length;)e._block(t.splice(0,16));return e.reset(),n}_f(e,t,n,s){return e>19?e>39?e>59?e>79?void 0:t^n^s:t&n|t&s|n&s:t^n^s:t&n|~t&s}_S(e,t){return t<<e|t>>>32-e}_block(t){const n=this,r=n._h,a=e(80);for(let e=0;16>e;e++)a[e]=t[e];let o=r[0],i=r[1],c=r[2],l=r[3],u=r[4];for(let e=0;79>=e;e++){16>e||(a[e]=n._S(1,a[e-3]^a[e-8]^a[e-14]^a[e-16]));const t=n._S(5,o)+n._f(e,i,c,l)+u+a[e]+n._key[s.floor(e/20)]|0;u=l,l=c,c=n._S(30,i),i=o,o=t}r[0]=r[0]+o|0,r[1]=r[1]+i|0,r[2]=r[2]+c|0,r[3]=r[3]+l|0,r[4]=r[4]+u|0}},H={getRandomValues(e){const t=new i(e.buffer),n=e=>{let t=987654321;const n=4294967295;return()=>(t=36969*(65535&t)+(t>>16)&n,(((t<<16)+(e=18e3*(65535&e)+(e>>16)&n)&n)/4294967296+.5)*(s.random()>.5?1:-1))};for(let r,a=0;a<e.length;a+=4){const e=n(4294967296*(r||s.random()));r=987654071*e(),t[a/4]=4294967296*e()|0}return e}},B={importKey:e=>new B.hmacSha1(I.bytes.toBits(e)),pbkdf2(e,t,n,s){if(n=n||1e4,0>s||0>n)throw new r("invalid params to pbkdf2");const a=1+(s>>5)<<2;let o,i,c,l,h;const p=new ArrayBuffer(a),f=new u(p);let d=0;const g=q;for(t=I.bytes.toBits(t),h=1;(a||1)>d;h++){for(o=i=e.encrypt(g.concat(t,[h])),c=1;n>c;c++)for(i=e.encrypt(i),l=0;l<i.length;l++)o[l]^=i[l];for(c=0;(a||1)>d&&c<o.length;c++)f.setInt32(d,o[c]),d+=4}return p.slice(0,s/8)},hmacSha1:class{constructor(e){const t=this,n=t._hash=R,s=[[],[]];t._baseHash=[new n,new n];const r=t._baseHash[0].blockSize/32;e.length>r&&(e=(new n).update(e).finalize());for(let t=0;r>t;t++)s[0][t]=909522486^e[t],s[1][t]=1549556828^e[t];t._baseHash[0].update(s[0]),t._baseHash[1].update(s[1]),t._resultHash=new n(t._baseHash[0])}reset(){const e=this;e._resultHash=new e._hash(e._baseHash[0]),e._updated=!1}update(e){this._updated=!0,this._resultHash.update(e)}digest(){const e=this,t=e._resultHash.finalize(),n=new e._hash(e._baseHash[1]).update(t).finalize();return e.reset(),n}encrypt(e){if(this._updated)throw new r("encrypt on already updated hmac called!");return this.update(e),this.digest(e)}}},K=typeof f!=S&&typeof f.getRandomValues==v,P="Invalid password",T="Invalid signature",V="zipjs-abort-check-password";function x(e){return K?f.getRandomValues(e):H.getRandomValues(e)}const D=16,E={name:"PBKDF2"},U=t.assign({hash:{name:"HMAC"}},E),W=t.assign({iterations:1e3,hash:{name:"SHA-1"}},E),M=["deriveBits"],N=[8,12,16],L=[16,24,32],F=10,O=[0,0,0,0],j=typeof f!=S,G=j&&f.subtle,X=j&&typeof G!=S,J=I.bytes,Q=class{constructor(e){const t=this;t._tables=[[[],[],[],[],[]],[[],[],[],[],[]]],t._tables[0][0][0]||t._precompute();const n=t._tables[0][4],s=t._tables[1],a=e.length;let o,i,c,l=1;if(4!==a&&6!==a&&8!==a)throw new r("invalid aes key size");for(t._key=[i=e.slice(0),c=[]],o=a;4*a+28>o;o++){let e=i[o-1];(o%a==0||8===a&&o%a==4)&&(e=n[e>>>24]<<24^n[e>>16&255]<<16^n[e>>8&255]<<8^n[255&e],o%a==0&&(e=e<<8^e>>>24^l<<24,l=l<<1^283*(l>>7))),i[o]=i[o-a]^e}for(let e=0;o;e++,o--){const t=i[3&e?o:o-4];c[e]=4>=o||4>e?t:s[0][n[t>>>24]]^s[1][n[t>>16&255]]^s[2][n[t>>8&255]]^s[3][n[255&t]]}}encrypt(e){return this._crypt(e,0)}decrypt(e){return this._crypt(e,1)}_precompute(){const e=this._tables[0],t=this._tables[1],n=e[4],s=t[4],r=[],a=[];let o,i,c,l;for(let e=0;256>e;e++)a[(r[e]=e<<1^283*(e>>7))^e]=e;for(let u=o=0;!n[u];u^=i||1,o=a[o]||1){let a=o^o<<1^o<<2^o<<3^o<<4;a=a>>8^255&a^99,n[u]=a,s[a]=u,l=r[c=r[i=r[u]]];let h=16843009*l^65537*c^257*i^16843008*u,p=257*r[a]^16843008*a;for(let n=0;4>n;n++)e[n][u]=p=p<<24^p>>>8,t[n][a]=h=h<<24^h>>>8}for(let n=0;5>n;n++)e[n]=e[n].slice(0),t[n]=t[n].slice(0)}_crypt(e,t){if(4!==e.length)throw new r("invalid aes block size");const n=this._key[t],s=n.length/4-2,a=[0,0,0,0],o=this._tables[t],i=o[0],c=o[1],l=o[2],u=o[3],h=o[4];let p,f,d,g=e[0]^n[0],w=e[t?3:1]^n[1],y=e[2]^n[2],m=e[t?1:3]^n[3],_=4;for(let e=0;s>e;e++)p=i[g>>>24]^c[w>>16&255]^l[y>>8&255]^u[255&m]^n[_],f=i[w>>>24]^c[y>>16&255]^l[m>>8&255]^u[255&g]^n[_+1],d=i[y>>>24]^c[m>>16&255]^l[g>>8&255]^u[255&w]^n[_+2],m=i[m>>>24]^c[g>>16&255]^l[w>>8&255]^u[255&y]^n[_+3],_+=4,g=p,w=f,y=d;for(let e=0;4>e;e++)a[t?3&-e:e]=h[g>>>24]<<24^h[w>>16&255]<<16^h[y>>8&255]<<8^h[255&m]^n[_++],p=g,g=w,w=y,y=m,m=p;return a}},Y=class{constructor(e,t){this._prf=e,this._initIv=t,this._iv=t}reset(){this._iv=this._initIv}update(e){return this.calculate(this._prf,e,this._iv)}incWord(e){if(255&~(e>>24))e+=1<<24;else{let t=e>>16&255,n=e>>8&255,s=255&e;255===t?(t=0,255===n?(n=0,255===s?s=0:++s):++n):++t,e=0,e+=t<<16,e+=n<<8,e+=s}return e}incCounter(e){0===(e[0]=this.incWord(e[0]))&&(e[1]=this.incWord(e[1]))}calculate(e,t,n){let s;if(!(s=t.length))return[];const r=q.bitLength(t);for(let r=0;s>r;r+=4){this.incCounter(n);const s=e.encrypt(n);t[r]^=s[0],t[r+1]^=s[1],t[r+2]^=s[2],t[r+3]^=s[3]}return q.clamp(t,r)}},Z=B.hmacSha1;let $=j&&X&&typeof G.importKey==v,ee=j&&X&&typeof G.deriveBits==v;class te extends g{constructor({password:e,rawPassword:n,signed:s,encryptionStrength:o,checkPasswordOnly:i}){super({start(){t.assign(this,{ready:new h((e=>this.resolveReady=e)),password:ae(e,n),signed:s,strength:o-1,pending:new a})},async transform(e,t){const n=this,{password:s,strength:o,resolveReady:c,ready:l}=n;s?(await(async(e,t,n,s)=>{const a=await re(e,t,n,ie(s,0,N[t])),o=ie(s,N[t]);if(a[0]!=o[0]||a[1]!=o[1])throw new r(P)})(n,o,s,ie(e,0,N[o]+2)),e=ie(e,N[o]+2),i?t.error(new r(V)):c()):await l;const u=new a(e.length-F-(e.length-F)%D);t.enqueue(se(n,e,u,0,F,!0))},async flush(e){const{signed:t,ctr:n,hmac:s,pending:o,ready:i}=this;if(s&&n){await i;const c=ie(o,0,o.length-F),l=ie(o,o.length-F);let u=new a;if(c.length){const e=le(J,c);s.update(e);const t=n.update(e);u=ce(J,t)}if(t){const e=ie(ce(J,s.digest()),0,F);for(let t=0;F>t;t++)if(e[t]!=l[t])throw new r(T)}e.enqueue(u)}}})}}class ne extends g{constructor({password:e,rawPassword:n,encryptionStrength:s}){let r;super({start(){t.assign(this,{ready:new h((e=>this.resolveReady=e)),password:ae(e,n),strength:s-1,pending:new a})},async transform(e,t){const n=this,{password:s,strength:r,resolveReady:o,ready:i}=n;let c=new a;s?(c=await(async(e,t,n)=>{const s=x(new a(N[t]));return oe(s,await re(e,t,n,s))})(n,r,s),o()):await i;const l=new a(c.length+e.length-e.length%D);l.set(c,0),t.enqueue(se(n,e,l,c.length,0))},async flush(e){const{ctr:t,hmac:n,pending:s,ready:o}=this;if(n&&t){await o;let i=new a;if(s.length){const e=t.update(le(J,s));n.update(e),i=ce(J,e)}r.signature=ce(J,n.digest()).slice(0,F),e.enqueue(oe(i,r.signature))}}}),r=this}}function se(e,t,n,s,r,o){const{ctr:i,hmac:c,pending:l}=e,u=t.length-r;let h;for(l.length&&(t=oe(l,t),n=((e,t)=>{if(t&&t>e.length){const n=e;(e=new a(t)).set(n,0)}return e})(n,u-u%D)),h=0;u-D>=h;h+=D){const e=le(J,ie(t,h,h+D));o&&c.update(e);const r=i.update(e);o||c.update(r),n.set(ce(J,r),h+s)}return e.pending=ie(t,h),n}async function re(n,s,r,o){n.password=null;const i=await(async(e,t,n,s,r)=>{if(!$)return B.importKey(t);try{return await G.importKey("raw",t,n,!1,r)}catch(e){return $=!1,B.importKey(t)}})(0,r,U,0,M),c=await(async(e,t,n)=>{if(!ee)return B.pbkdf2(t,e.salt,W.iterations,n);try{return await G.deriveBits(e,t,n)}catch(s){return ee=!1,B.pbkdf2(t,e.salt,W.iterations,n)}})(t.assign({salt:o},W),i,8*(2*L[s]+2)),l=new a(c),u=le(J,ie(l,0,L[s])),h=le(J,ie(l,L[s],2*L[s])),p=ie(l,2*L[s]);return t.assign(n,{keys:{key:u,authentication:h,passwordVerification:p},ctr:new Y(new Q(u),e.from(O)),hmac:new Z(h)}),p}function ae(e,t){return t===b?(e=>{if(typeof p==S){const t=new a((e=unescape(encodeURIComponent(e))).length);for(let n=0;n<t.length;n++)t[n]=e.charCodeAt(n);return t}return(new p).encode(e)})(e):t}function oe(e,t){let n=e;return e.length+t.length&&(n=new a(e.length+t.length),n.set(e,0),n.set(t,e.length)),n}function ie(e,t,n){return e.subarray(t,n)}function ce(e,t){return e.fromBits(t)}function le(e,t){return e.toBits(t)}class ue extends g{constructor({password:e,passwordVerification:n,checkPasswordOnly:s}){super({start(){t.assign(this,{password:e,passwordVerification:n}),de(this,e)},transform(e,t){const n=this;if(n.password){const t=pe(n,e.subarray(0,12));if(n.password=null,t[11]!=n.passwordVerification)throw new r(P);e=e.subarray(12)}s?t.error(new r(V)):t.enqueue(pe(n,e))}})}}class he extends g{constructor({password:e,passwordVerification:n}){super({start(){t.assign(this,{password:e,passwordVerification:n}),de(this,e)},transform(e,t){const n=this;let s,r;if(n.password){n.password=null;const t=x(new a(12));t[11]=n.passwordVerification,s=new a(e.length+t.length),s.set(fe(n,t),0),r=12}else s=new a(e.length),r=0;s.set(fe(n,e),r),t.enqueue(s)}})}}function pe(e,t){const n=new a(t.length);for(let s=0;s<t.length;s++)n[s]=we(e)^t[s],ge(e,n[s]);return n}function fe(e,t){const n=new a(t.length);for(let s=0;s<t.length;s++)n[s]=we(e)^t[s],ge(e,t[s]);return n}function de(e,n){const s=[305419896,591751049,878082192];t.assign(e,{keys:s,crcKey0:new C(s[0]),crcKey2:new C(s[2])});for(let t=0;t<n.length;t++)ge(e,n.charCodeAt(t))}function ge(e,t){let[n,r,a]=e.keys;e.crcKey0.append([t]),n=~e.crcKey0.get(),r=me(s.imul(me(r+ye(n)),134775813)+1),e.crcKey2.append([r>>>24]),a=~e.crcKey2.get(),e.keys=[n,r,a]}function we(e){const t=2|e.keys[2];return ye(s.imul(t,1^t)>>>8)}function ye(e){return 255&e}function me(e){return 4294967295&e}const _e="deflate-raw";class be extends g{constructor(e,{chunkSize:t,CompressionStream:n,CompressionStreamNative:s}){super({});const{compressed:r,encrypted:a,useCompressionStream:o,zipCrypto:i,signed:c,level:l}=e,h=this;let p,f,d=ve(super.readable);a&&!i||!c||(p=new A,d=Ce(d,p)),r&&(d=ze(d,o,{level:l,chunkSize:t},s,n)),a&&(i?d=Ce(d,new he(e)):(f=new ne(e),d=Ce(d,f))),ke(h,d,(()=>{let e;a&&!i&&(e=f.signature),a&&!i||!c||(e=new u(p.value.buffer).getUint32(0)),h.signature=e}))}}class Se extends g{constructor(e,{chunkSize:t,DecompressionStream:n,DecompressionStreamNative:s}){super({});const{zipCrypto:a,encrypted:o,signed:i,signature:c,compressed:l,useCompressionStream:h}=e;let p,f,d=ve(super.readable);o&&(a?d=Ce(d,new ue(e)):(f=new te(e),d=Ce(d,f))),l&&(d=ze(d,h,{chunkSize:t},s,n)),o&&!a||!i||(p=new A,d=Ce(d,p)),ke(this,d,(()=>{if((!o||a)&&i){const e=new u(p.value.buffer);if(c!=e.getUint32(0,!1))throw new r(T)}}))}}function ve(e){return Ce(e,new g({transform(e,t){e&&e.length&&t.enqueue(e)}}))}function ke(e,n,s){n=Ce(n,new g({flush:s})),t.defineProperty(e,"readable",{get:()=>n})}function ze(e,t,n,s,r){try{e=Ce(e,new(t&&s?s:r)(_e,n))}catch(s){if(!t)return e;try{e=Ce(e,new r(_e,n))}catch(t){return e}}return e}function Ce(e,t){return e.pipeThrough(t)}const Ae="data",qe="close";class Ie extends g{constructor(e,n){super({});const s=this,{codecType:r}=e;let a;r.startsWith("deflate")?a=be:r.startsWith("inflate")&&(a=Se);let o=0,i=0;const c=new a(e,n),l=super.readable,u=new g({transform(e,t){e&&e.length&&(i+=e.length,t.enqueue(e))},flush(){t.assign(s,{inputSize:i})}}),h=new g({transform(e,t){e&&e.length&&(o+=e.length,t.enqueue(e))},flush(){const{signature:e}=c;t.assign(s,{signature:e,outputSize:o,inputSize:i})}});t.defineProperty(s,"readable",{get:()=>l.pipeThrough(u).pipeThrough(c).pipeThrough(h)})}}class Re extends g{constructor(e){let t;super({transform:function n(s,r){if(t){const e=new a(t.length+s.length);e.set(t),e.set(s,t.length),s=e,t=null}s.length>e?(r.enqueue(s.slice(0,e)),n(s.slice(e),r)):t=s},flush(e){t&&t.length&&e.enqueue(t)}})}}const He=new l,Be=new l;let Ke,Pe=0,Te=!0;async function Ve(e){try{const{options:t,scripts:s,config:r}=e;if(s&&s.length)try{Te?importScripts.apply(b,s):await xe(s)}catch(e){Te=!1,await xe(s)}self.initCodec&&self.initCodec(),r.CompressionStreamNative=self.CompressionStream,r.DecompressionStreamNative=self.DecompressionStream,self.Deflate&&(r.CompressionStream=new k(self.Deflate)),self.Inflate&&(r.DecompressionStream=new k(self.Inflate));const a={highWaterMark:1},o=e.readable||new w({async pull(e){const t=new h((e=>He.set(Pe,e)));De({type:"pull",messageId:Pe}),Pe=(Pe+1)%n.MAX_SAFE_INTEGER;const{value:s,done:r}=await t;e.enqueue(s),r&&e.close()}},a),i=e.writable||new y({async write(e){let t;const s=new h((e=>t=e));Be.set(Pe,t),De({type:Ae,value:e,messageId:Pe}),Pe=(Pe+1)%n.MAX_SAFE_INTEGER,await s}},a),c=new Ie(t,r);Ke=new AbortController;const{signal:l}=Ke;await o.pipeThrough(c).pipeThrough(new Re(r.chunkSize)).pipeTo(i,{signal:l,preventClose:!0,preventAbort:!0}),await i.getWriter().close();const{signature:u,inputSize:p,outputSize:f}=c;De({type:qe,result:{signature:u,inputSize:p,outputSize:f}})}catch(e){Ee(e)}}async function xe(e){for(const t of e)await import(t)}function De(e){let{value:t}=e;if(t)if(t.length)try{t=new a(t),e.value=t.buffer,d(e,[e.value])}catch(t){d(e)}else d(e);else d(e)}function Ee(e=new r("Unknown error")){const{message:t,stack:n,code:s,name:a}=e;d({error:{message:t,stack:n,code:s,name:a}})}addEventListener("message",(({data:e})=>{const{type:t,messageId:n,value:s,done:r}=e;try{if("start"==t&&Ve(e),t==Ae){const e=He.get(n);He.delete(n),e({value:new a(s),done:r})}if("ack"==t){const e=Be.get(n);Be.delete(n),e()}t==qe&&Ke.abort()}catch(e){Ee(e)}})),self.initCodec=()=>{};\n'],{type:"text/javascript"}));e({workerScripts:{inflate:[t],deflate:[t]}});}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


function getMimeType() {
	return "application/octet-stream";
}

function initShimAsyncCodec(library, options = {}, registerDataHandler) {
	return {
		Deflate: createCodecClass(library.Deflate, options.deflate, registerDataHandler),
		Inflate: createCodecClass(library.Inflate, options.inflate, registerDataHandler)
	};
}

function objectHasOwn(object, propertyName) {
	// eslint-disable-next-line no-prototype-builtins
	return typeof Object.hasOwn === FUNCTION_TYPE ? Object.hasOwn(object, propertyName) : object.hasOwnProperty(propertyName);
}

function createCodecClass(constructor, constructorOptions, registerDataHandler) {
	return class {

		constructor(options) {
			const codecAdapter = this;
			const onData = data => {
				if (codecAdapter.pendingData) {
					const previousPendingData = codecAdapter.pendingData;
					codecAdapter.pendingData = new Uint8Array(previousPendingData.length + data.length);
					const { pendingData } = codecAdapter;
					pendingData.set(previousPendingData, 0);
					pendingData.set(data, previousPendingData.length);
				} else {
					codecAdapter.pendingData = new Uint8Array(data);
				}
			};
			if (objectHasOwn(options, "level") && options.level === UNDEFINED_VALUE) {
				delete options.level;
			}
			codecAdapter.codec = new constructor(Object.assign({}, constructorOptions, options));
			registerDataHandler(codecAdapter.codec, onData);
		}
		append(data) {
			this.codec.push(data);
			return getResponse(this);
		}
		flush() {
			this.codec.push(new Uint8Array(), true);
			return getResponse(this);
		}
	};

	function getResponse(codec) {
		if (codec.pendingData) {
			const output = codec.pendingData;
			codec.pendingData = null;
			return output;
		} else {
			return new Uint8Array();
		}
	}
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const table = [];
for (let i = 0; i < 256; i++) {
	let t = i;
	for (let j = 0; j < 8; j++) {
		if (t & 1) {
			t = (t >>> 1) ^ 0xEDB88320;
		} else {
			t = t >>> 1;
		}
	}
	table[i] = t;
}

class Crc32 {

	constructor(crc) {
		this.crc = crc || -1;
	}

	append(data) {
		let crc = this.crc | 0;
		for (let offset = 0, length = data.length | 0; offset < length; offset++) {
			crc = (crc >>> 8) ^ table[(crc ^ data[offset]) & 0xFF];
		}
		this.crc = crc;
	}

	get() {
		return ~this.crc;
	}
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


class Crc32Stream extends TransformStream {

	constructor() {
		let stream;
		const crc32 = new Crc32();
		super({
			transform(chunk, controller) {
				crc32.append(chunk);
				controller.enqueue(chunk);
			},
			flush() {
				const value = new Uint8Array(4);
				const dataView = new DataView(value.buffer);
				dataView.setUint32(0, crc32.get());
				stream.value = value;
			}
		});
		stream = this;
	}
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


function encodeText(value) {
	if (typeof TextEncoder == UNDEFINED_TYPE) {
		value = unescape(encodeURIComponent(value));
		const result = new Uint8Array(value.length);
		for (let i = 0; i < result.length; i++) {
			result[i] = value.charCodeAt(i);
		}
		return result;
	} else {
		return new TextEncoder().encode(value);
	}
}

// Derived from https://github.com/xqdoo00o/jszip/blob/master/lib/sjcl.js and https://github.com/bitwiseshiftleft/sjcl

// deno-lint-ignore-file no-this-alias

/*
 * SJCL is open. You can use, modify and redistribute it under a BSD
 * license or under the GNU GPL, version 2.0.
 */

/** @fileOverview Javascript cryptography implementation.
 *
 * Crush to remove comments, shorten variable names and
 * generally reduce transmission size.
 *
 * @author Emily Stark
 * @author Mike Hamburg
 * @author Dan Boneh
 */

/*jslint indent: 2, bitwise: false, nomen: false, plusplus: false, white: false, regexp: false */

/** @fileOverview Arrays of bits, encoded as arrays of Numbers.
 *
 * @author Emily Stark
 * @author Mike Hamburg
 * @author Dan Boneh
 */

/**
 * Arrays of bits, encoded as arrays of Numbers.
 * @namespace
 * @description
 * <p>
 * These objects are the currency accepted by SJCL's crypto functions.
 * </p>
 *
 * <p>
 * Most of our crypto primitives operate on arrays of 4-byte words internally,
 * but many of them can take arguments that are not a multiple of 4 bytes.
 * This library encodes arrays of bits (whose size need not be a multiple of 8
 * bits) as arrays of 32-bit words.  The bits are packed, big-endian, into an
 * array of words, 32 bits at a time.  Since the words are double-precision
 * floating point numbers, they fit some extra data.  We use this (in a private,
 * possibly-changing manner) to encode the number of bits actually  present
 * in the last word of the array.
 * </p>
 *
 * <p>
 * Because bitwise ops clear this out-of-band data, these arrays can be passed
 * to ciphers like AES which want arrays of words.
 * </p>
 */
const bitArray = {
	/**
	 * Concatenate two bit arrays.
	 * @param {bitArray} a1 The first array.
	 * @param {bitArray} a2 The second array.
	 * @return {bitArray} The concatenation of a1 and a2.
	 */
	concat(a1, a2) {
		if (a1.length === 0 || a2.length === 0) {
			return a1.concat(a2);
		}

		const last = a1[a1.length - 1], shift = bitArray.getPartial(last);
		if (shift === 32) {
			return a1.concat(a2);
		} else {
			return bitArray._shiftRight(a2, shift, last | 0, a1.slice(0, a1.length - 1));
		}
	},

	/**
	 * Find the length of an array of bits.
	 * @param {bitArray} a The array.
	 * @return {Number} The length of a, in bits.
	 */
	bitLength(a) {
		const l = a.length;
		if (l === 0) {
			return 0;
		}
		const x = a[l - 1];
		return (l - 1) * 32 + bitArray.getPartial(x);
	},

	/**
	 * Truncate an array.
	 * @param {bitArray} a The array.
	 * @param {Number} len The length to truncate to, in bits.
	 * @return {bitArray} A new array, truncated to len bits.
	 */
	clamp(a, len) {
		if (a.length * 32 < len) {
			return a;
		}
		a = a.slice(0, Math.ceil(len / 32));
		const l = a.length;
		len = len & 31;
		if (l > 0 && len) {
			a[l - 1] = bitArray.partial(len, a[l - 1] & 0x80000000 >> (len - 1), 1);
		}
		return a;
	},

	/**
	 * Make a partial word for a bit array.
	 * @param {Number} len The number of bits in the word.
	 * @param {Number} x The bits.
	 * @param {Number} [_end=0] Pass 1 if x has already been shifted to the high side.
	 * @return {Number} The partial word.
	 */
	partial(len, x, _end) {
		if (len === 32) {
			return x;
		}
		return (_end ? x | 0 : x << (32 - len)) + len * 0x10000000000;
	},

	/**
	 * Get the number of bits used by a partial word.
	 * @param {Number} x The partial word.
	 * @return {Number} The number of bits used by the partial word.
	 */
	getPartial(x) {
		return Math.round(x / 0x10000000000) || 32;
	},

	/** Shift an array right.
	 * @param {bitArray} a The array to shift.
	 * @param {Number} shift The number of bits to shift.
	 * @param {Number} [carry=0] A byte to carry in
	 * @param {bitArray} [out=[]] An array to prepend to the output.
	 * @private
	 */
	_shiftRight(a, shift, carry, out) {
		if (out === undefined) {
			out = [];
		}

		for (; shift >= 32; shift -= 32) {
			out.push(carry);
			carry = 0;
		}
		if (shift === 0) {
			return out.concat(a);
		}

		for (let i = 0; i < a.length; i++) {
			out.push(carry | a[i] >>> shift);
			carry = a[i] << (32 - shift);
		}
		const last2 = a.length ? a[a.length - 1] : 0;
		const shift2 = bitArray.getPartial(last2);
		out.push(bitArray.partial(shift + shift2 & 31, (shift + shift2 > 32) ? carry : out.pop(), 1));
		return out;
	}
};

/** @fileOverview Bit array codec implementations.
 *
 * @author Emily Stark
 * @author Mike Hamburg
 * @author Dan Boneh
 */

/**
 * Arrays of bytes
 * @namespace
 */
const codec = {
	bytes: {
		/** Convert from a bitArray to an array of bytes. */
		fromBits(arr) {
			const bl = bitArray.bitLength(arr);
			const byteLength = bl / 8;
			const out = new Uint8Array(byteLength);
			let tmp;
			for (let i = 0; i < byteLength; i++) {
				if ((i & 3) === 0) {
					tmp = arr[i / 4];
				}
				out[i] = tmp >>> 24;
				tmp <<= 8;
			}
			return out;
		},
		/** Convert from an array of bytes to a bitArray. */
		toBits(bytes) {
			const out = [];
			let i;
			let tmp = 0;
			for (i = 0; i < bytes.length; i++) {
				tmp = tmp << 8 | bytes[i];
				if ((i & 3) === 3) {
					out.push(tmp);
					tmp = 0;
				}
			}
			if (i & 3) {
				out.push(bitArray.partial(8 * (i & 3), tmp));
			}
			return out;
		}
	}
};

const hash = {};

/**
 * Context for a SHA-1 operation in progress.
 * @constructor
 */
hash.sha1 = class {
	constructor(hash) {
		const sha1 = this;
		/**
		 * The hash's block size, in bits.
		 * @constant
		 */
		sha1.blockSize = 512;
		/**
		 * The SHA-1 initialization vector.
		 * @private
		 */
		sha1._init = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
		/**
		 * The SHA-1 hash key.
		 * @private
		 */
		sha1._key = [0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xCA62C1D6];
		if (hash) {
			sha1._h = hash._h.slice(0);
			sha1._buffer = hash._buffer.slice(0);
			sha1._length = hash._length;
		} else {
			sha1.reset();
		}
	}

	/**
	 * Reset the hash state.
	 * @return this
	 */
	reset() {
		const sha1 = this;
		sha1._h = sha1._init.slice(0);
		sha1._buffer = [];
		sha1._length = 0;
		return sha1;
	}

	/**
	 * Input several words to the hash.
	 * @param {bitArray|String} data the data to hash.
	 * @return this
	 */
	update(data) {
		const sha1 = this;
		if (typeof data === "string") {
			data = codec.utf8String.toBits(data);
		}
		const b = sha1._buffer = bitArray.concat(sha1._buffer, data);
		const ol = sha1._length;
		const nl = sha1._length = ol + bitArray.bitLength(data);
		if (nl > 9007199254740991) {
			throw new Error("Cannot hash more than 2^53 - 1 bits");
		}
		const c = new Uint32Array(b);
		let j = 0;
		for (let i = sha1.blockSize + ol - ((sha1.blockSize + ol) & (sha1.blockSize - 1)); i <= nl;
			i += sha1.blockSize) {
			sha1._block(c.subarray(16 * j, 16 * (j + 1)));
			j += 1;
		}
		b.splice(0, 16 * j);
		return sha1;
	}

	/**
	 * Complete hashing and output the hash value.
	 * @return {bitArray} The hash value, an array of 5 big-endian words. TODO
	 */
	finalize() {
		const sha1 = this;
		let b = sha1._buffer;
		const h = sha1._h;

		// Round out and push the buffer
		b = bitArray.concat(b, [bitArray.partial(1, 1)]);
		// Round out the buffer to a multiple of 16 words, less the 2 length words.
		for (let i = b.length + 2; i & 15; i++) {
			b.push(0);
		}

		// append the length
		b.push(Math.floor(sha1._length / 0x100000000));
		b.push(sha1._length | 0);

		while (b.length) {
			sha1._block(b.splice(0, 16));
		}

		sha1.reset();
		return h;
	}

	/**
	 * The SHA-1 logical functions f(0), f(1), ..., f(79).
	 * @private
	 */
	_f(t, b, c, d) {
		if (t <= 19) {
			return (b & c) | (~b & d);
		} else if (t <= 39) {
			return b ^ c ^ d;
		} else if (t <= 59) {
			return (b & c) | (b & d) | (c & d);
		} else if (t <= 79) {
			return b ^ c ^ d;
		}
	}

	/**
	 * Circular left-shift operator.
	 * @private
	 */
	_S(n, x) {
		return (x << n) | (x >>> 32 - n);
	}

	/**
	 * Perform one cycle of SHA-1.
	 * @param {Uint32Array|bitArray} words one block of words.
	 * @private
	 */
	_block(words) {
		const sha1 = this;
		const h = sha1._h;
		// When words is passed to _block, it has 16 elements. SHA1 _block
		// function extends words with new elements (at the end there are 80 elements). 
		// The problem is that if we use Uint32Array instead of Array, 
		// the length of Uint32Array cannot be changed. Thus, we replace words with a 
		// normal Array here.
		const w = Array(80); // do not use Uint32Array here as the instantiation is slower
		for (let j = 0; j < 16; j++) {
			w[j] = words[j];
		}

		let a = h[0];
		let b = h[1];
		let c = h[2];
		let d = h[3];
		let e = h[4];

		for (let t = 0; t <= 79; t++) {
			if (t >= 16) {
				w[t] = sha1._S(1, w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]);
			}
			const tmp = (sha1._S(5, a) + sha1._f(t, b, c, d) + e + w[t] +
				sha1._key[Math.floor(t / 20)]) | 0;
			e = d;
			d = c;
			c = sha1._S(30, b);
			b = a;
			a = tmp;
		}

		h[0] = (h[0] + a) | 0;
		h[1] = (h[1] + b) | 0;
		h[2] = (h[2] + c) | 0;
		h[3] = (h[3] + d) | 0;
		h[4] = (h[4] + e) | 0;
	}
};

/** @fileOverview Low-level AES implementation.
 *
 * This file contains a low-level implementation of AES, optimized for
 * size and for efficiency on several browsers.  It is based on
 * OpenSSL's aes_core.c, a public-domain implementation by Vincent
 * Rijmen, Antoon Bosselaers and Paulo Barreto.
 *
 * An older version of this implementation is available in the public
 * domain, but this one is (c) Emily Stark, Mike Hamburg, Dan Boneh,
 * Stanford University 2008-2010 and BSD-licensed for liability
 * reasons.
 *
 * @author Emily Stark
 * @author Mike Hamburg
 * @author Dan Boneh
 */

const cipher = {};

/**
 * Schedule out an AES key for both encryption and decryption.  This
 * is a low-level class.  Use a cipher mode to do bulk encryption.
 *
 * @constructor
 * @param {Array} key The key as an array of 4, 6 or 8 words.
 */
cipher.aes = class {
	constructor(key) {
		/**
		 * The expanded S-box and inverse S-box tables.  These will be computed
		 * on the client so that we don't have to send them down the wire.
		 *
		 * There are two tables, _tables[0] is for encryption and
		 * _tables[1] is for decryption.
		 *
		 * The first 4 sub-tables are the expanded S-box with MixColumns.  The
		 * last (_tables[01][4]) is the S-box itself.
		 *
		 * @private
		 */
		const aes = this;
		aes._tables = [[[], [], [], [], []], [[], [], [], [], []]];

		if (!aes._tables[0][0][0]) {
			aes._precompute();
		}

		const sbox = aes._tables[0][4];
		const decTable = aes._tables[1];
		const keyLen = key.length;

		let i, encKey, decKey, rcon = 1;

		if (keyLen !== 4 && keyLen !== 6 && keyLen !== 8) {
			throw new Error("invalid aes key size");
		}

		aes._key = [encKey = key.slice(0), decKey = []];

		// schedule encryption keys
		for (i = keyLen; i < 4 * keyLen + 28; i++) {
			let tmp = encKey[i - 1];

			// apply sbox
			if (i % keyLen === 0 || (keyLen === 8 && i % keyLen === 4)) {
				tmp = sbox[tmp >>> 24] << 24 ^ sbox[tmp >> 16 & 255] << 16 ^ sbox[tmp >> 8 & 255] << 8 ^ sbox[tmp & 255];

				// shift rows and add rcon
				if (i % keyLen === 0) {
					tmp = tmp << 8 ^ tmp >>> 24 ^ rcon << 24;
					rcon = rcon << 1 ^ (rcon >> 7) * 283;
				}
			}

			encKey[i] = encKey[i - keyLen] ^ tmp;
		}

		// schedule decryption keys
		for (let j = 0; i; j++, i--) {
			const tmp = encKey[j & 3 ? i : i - 4];
			if (i <= 4 || j < 4) {
				decKey[j] = tmp;
			} else {
				decKey[j] = decTable[0][sbox[tmp >>> 24]] ^
					decTable[1][sbox[tmp >> 16 & 255]] ^
					decTable[2][sbox[tmp >> 8 & 255]] ^
					decTable[3][sbox[tmp & 255]];
			}
		}
	}
	// public
	/* Something like this might appear here eventually
	name: "AES",
	blockSize: 4,
	keySizes: [4,6,8],
	*/

	/**
	 * Encrypt an array of 4 big-endian words.
	 * @param {Array} data The plaintext.
	 * @return {Array} The ciphertext.
	 */
	encrypt(data) {
		return this._crypt(data, 0);
	}

	/**
	 * Decrypt an array of 4 big-endian words.
	 * @param {Array} data The ciphertext.
	 * @return {Array} The plaintext.
	 */
	decrypt(data) {
		return this._crypt(data, 1);
	}

	/**
	 * Expand the S-box tables.
	 *
	 * @private
	 */
	_precompute() {
		const encTable = this._tables[0];
		const decTable = this._tables[1];
		const sbox = encTable[4];
		const sboxInv = decTable[4];
		const d = [];
		const th = [];
		let xInv, x2, x4, x8;

		// Compute double and third tables
		for (let i = 0; i < 256; i++) {
			th[(d[i] = i << 1 ^ (i >> 7) * 283) ^ i] = i;
		}

		for (let x = xInv = 0; !sbox[x]; x ^= x2 || 1, xInv = th[xInv] || 1) {
			// Compute sbox
			let s = xInv ^ xInv << 1 ^ xInv << 2 ^ xInv << 3 ^ xInv << 4;
			s = s >> 8 ^ s & 255 ^ 99;
			sbox[x] = s;
			sboxInv[s] = x;

			// Compute MixColumns
			x8 = d[x4 = d[x2 = d[x]]];
			let tDec = x8 * 0x1010101 ^ x4 * 0x10001 ^ x2 * 0x101 ^ x * 0x1010100;
			let tEnc = d[s] * 0x101 ^ s * 0x1010100;

			for (let i = 0; i < 4; i++) {
				encTable[i][x] = tEnc = tEnc << 24 ^ tEnc >>> 8;
				decTable[i][s] = tDec = tDec << 24 ^ tDec >>> 8;
			}
		}

		// Compactify.  Considerable speedup on Firefox.
		for (let i = 0; i < 5; i++) {
			encTable[i] = encTable[i].slice(0);
			decTable[i] = decTable[i].slice(0);
		}
	}

	/**
	 * Encryption and decryption core.
	 * @param {Array} input Four words to be encrypted or decrypted.
	 * @param dir The direction, 0 for encrypt and 1 for decrypt.
	 * @return {Array} The four encrypted or decrypted words.
	 * @private
	 */
	_crypt(input, dir) {
		if (input.length !== 4) {
			throw new Error("invalid aes block size");
		}

		const key = this._key[dir];

		const nInnerRounds = key.length / 4 - 2;
		const out = [0, 0, 0, 0];
		const table = this._tables[dir];

		// load up the tables
		const t0 = table[0];
		const t1 = table[1];
		const t2 = table[2];
		const t3 = table[3];
		const sbox = table[4];

		// state variables a,b,c,d are loaded with pre-whitened data
		let a = input[0] ^ key[0];
		let b = input[dir ? 3 : 1] ^ key[1];
		let c = input[2] ^ key[2];
		let d = input[dir ? 1 : 3] ^ key[3];
		let kIndex = 4;
		let a2, b2, c2;

		// Inner rounds.  Cribbed from OpenSSL.
		for (let i = 0; i < nInnerRounds; i++) {
			a2 = t0[a >>> 24] ^ t1[b >> 16 & 255] ^ t2[c >> 8 & 255] ^ t3[d & 255] ^ key[kIndex];
			b2 = t0[b >>> 24] ^ t1[c >> 16 & 255] ^ t2[d >> 8 & 255] ^ t3[a & 255] ^ key[kIndex + 1];
			c2 = t0[c >>> 24] ^ t1[d >> 16 & 255] ^ t2[a >> 8 & 255] ^ t3[b & 255] ^ key[kIndex + 2];
			d = t0[d >>> 24] ^ t1[a >> 16 & 255] ^ t2[b >> 8 & 255] ^ t3[c & 255] ^ key[kIndex + 3];
			kIndex += 4;
			a = a2; b = b2; c = c2;
		}

		// Last round.
		for (let i = 0; i < 4; i++) {
			out[dir ? 3 & -i : i] =
				sbox[a >>> 24] << 24 ^
				sbox[b >> 16 & 255] << 16 ^
				sbox[c >> 8 & 255] << 8 ^
				sbox[d & 255] ^
				key[kIndex++];
			a2 = a; a = b; b = c; c = d; d = a2;
		}

		return out;
	}
};

/**
 * Random values
 * @namespace
 */
const random = {
	/** 
	 * Generate random words with pure js, cryptographically not as strong & safe as native implementation.
	 * @param {TypedArray} typedArray The array to fill.
	 * @return {TypedArray} The random values.
	 */
	getRandomValues(typedArray) {
		const words = new Uint32Array(typedArray.buffer);
		const r = (m_w) => {
			let m_z = 0x3ade68b1;
			const mask = 0xffffffff;
			return function () {
				m_z = (0x9069 * (m_z & 0xFFFF) + (m_z >> 0x10)) & mask;
				m_w = (0x4650 * (m_w & 0xFFFF) + (m_w >> 0x10)) & mask;
				const result = ((((m_z << 0x10) + m_w) & mask) / 0x100000000) + .5;
				return result * (Math.random() > .5 ? 1 : -1);
			};
		};
		for (let i = 0, rcache; i < typedArray.length; i += 4) {
			const _r = r((rcache || Math.random()) * 0x100000000);
			rcache = _r() * 0x3ade67b7;
			words[i / 4] = (_r() * 0x100000000) | 0;
		}
		return typedArray;
	}
};

/** @fileOverview CTR mode implementation.
 *
 * Special thanks to Roy Nicholson for pointing out a bug in our
 * implementation.
 *
 * @author Emily Stark
 * @author Mike Hamburg
 * @author Dan Boneh
 */

/** Brian Gladman's CTR Mode.
* @constructor
* @param {Object} _prf The aes instance to generate key.
* @param {bitArray} _iv The iv for ctr mode, it must be 128 bits.
*/

const mode = {};

/**
 * Brian Gladman's CTR Mode.
 * @namespace
 */
mode.ctrGladman = class {
	constructor(prf, iv) {
		this._prf = prf;
		this._initIv = iv;
		this._iv = iv;
	}

	reset() {
		this._iv = this._initIv;
	}

	/** Input some data to calculate.
	 * @param {bitArray} data the data to process, it must be intergral multiple of 128 bits unless it's the last.
	 */
	update(data) {
		return this.calculate(this._prf, data, this._iv);
	}

	incWord(word) {
		if (((word >> 24) & 0xff) === 0xff) { //overflow
			let b1 = (word >> 16) & 0xff;
			let b2 = (word >> 8) & 0xff;
			let b3 = word & 0xff;

			if (b1 === 0xff) { // overflow b1   
				b1 = 0;
				if (b2 === 0xff) {
					b2 = 0;
					if (b3 === 0xff) {
						b3 = 0;
					} else {
						++b3;
					}
				} else {
					++b2;
				}
			} else {
				++b1;
			}

			word = 0;
			word += (b1 << 16);
			word += (b2 << 8);
			word += b3;
		} else {
			word += (0x01 << 24);
		}
		return word;
	}

	incCounter(counter) {
		if ((counter[0] = this.incWord(counter[0])) === 0) {
			// encr_data in fileenc.c from  Dr Brian Gladman's counts only with DWORD j < 8
			counter[1] = this.incWord(counter[1]);
		}
	}

	calculate(prf, data, iv) {
		let l;
		if (!(l = data.length)) {
			return [];
		}
		const bl = bitArray.bitLength(data);
		for (let i = 0; i < l; i += 4) {
			this.incCounter(iv);
			const e = prf.encrypt(iv);
			data[i] ^= e[0];
			data[i + 1] ^= e[1];
			data[i + 2] ^= e[2];
			data[i + 3] ^= e[3];
		}
		return bitArray.clamp(data, bl);
	}
};

const misc = {
	importKey(password) {
		return new misc.hmacSha1(codec.bytes.toBits(password));
	},
	pbkdf2(prf, salt, count, length) {
		count = count || 10000;
		if (length < 0 || count < 0) {
			throw new Error("invalid params to pbkdf2");
		}
		const byteLength = ((length >> 5) + 1) << 2;
		let u, ui, i, j, k;
		const arrayBuffer = new ArrayBuffer(byteLength);
		const out = new DataView(arrayBuffer);
		let outLength = 0;
		const b = bitArray;
		salt = codec.bytes.toBits(salt);
		for (k = 1; outLength < (byteLength || 1); k++) {
			u = ui = prf.encrypt(b.concat(salt, [k]));
			for (i = 1; i < count; i++) {
				ui = prf.encrypt(ui);
				for (j = 0; j < ui.length; j++) {
					u[j] ^= ui[j];
				}
			}
			for (i = 0; outLength < (byteLength || 1) && i < u.length; i++) {
				out.setInt32(outLength, u[i]);
				outLength += 4;
			}
		}
		return arrayBuffer.slice(0, length / 8);
	}
};

/** @fileOverview HMAC implementation.
 *
 * @author Emily Stark
 * @author Mike Hamburg
 * @author Dan Boneh
 */

/** HMAC with the specified hash function.
 * @constructor
 * @param {bitArray} key the key for HMAC.
 * @param {Object} [Hash=hash.sha1] The hash function to use.
 */
misc.hmacSha1 = class {

	constructor(key) {
		const hmac = this;
		const Hash = hmac._hash = hash.sha1;
		const exKey = [[], []];
		hmac._baseHash = [new Hash(), new Hash()];
		const bs = hmac._baseHash[0].blockSize / 32;

		if (key.length > bs) {
			key = new Hash().update(key).finalize();
		}

		for (let i = 0; i < bs; i++) {
			exKey[0][i] = key[i] ^ 0x36363636;
			exKey[1][i] = key[i] ^ 0x5C5C5C5C;
		}

		hmac._baseHash[0].update(exKey[0]);
		hmac._baseHash[1].update(exKey[1]);
		hmac._resultHash = new Hash(hmac._baseHash[0]);
	}
	reset() {
		const hmac = this;
		hmac._resultHash = new hmac._hash(hmac._baseHash[0]);
		hmac._updated = false;
	}

	update(data) {
		const hmac = this;
		hmac._updated = true;
		hmac._resultHash.update(data);
	}

	digest() {
		const hmac = this;
		const w = hmac._resultHash.finalize();
		const result = new (hmac._hash)(hmac._baseHash[1]).update(w).finalize();

		hmac.reset();

		return result;
	}

	encrypt(data) {
		if (!this._updated) {
			this.update(data);
			return this.digest(data);
		} else {
			throw new Error("encrypt on already updated hmac called!");
		}
	}
};

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


const GET_RANDOM_VALUES_SUPPORTED = typeof crypto != UNDEFINED_TYPE && typeof crypto.getRandomValues == FUNCTION_TYPE;

const ERR_INVALID_PASSWORD = "Invalid password";
const ERR_INVALID_SIGNATURE = "Invalid signature";
const ERR_ABORT_CHECK_PASSWORD = "zipjs-abort-check-password";

function getRandomValues(array) {
	if (GET_RANDOM_VALUES_SUPPORTED) {
		return crypto.getRandomValues(array);
	} else {
		return random.getRandomValues(array);
	}
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


const BLOCK_LENGTH = 16;
const RAW_FORMAT = "raw";
const PBKDF2_ALGORITHM = { name: "PBKDF2" };
const HASH_ALGORITHM = { name: "HMAC" };
const HASH_FUNCTION = "SHA-1";
const BASE_KEY_ALGORITHM = Object.assign({ hash: HASH_ALGORITHM }, PBKDF2_ALGORITHM);
const DERIVED_BITS_ALGORITHM = Object.assign({ iterations: 1000, hash: { name: HASH_FUNCTION } }, PBKDF2_ALGORITHM);
const DERIVED_BITS_USAGE = ["deriveBits"];
const SALT_LENGTH = [8, 12, 16];
const KEY_LENGTH = [16, 24, 32];
const SIGNATURE_LENGTH = 10;
const COUNTER_DEFAULT_VALUE = [0, 0, 0, 0];
// deno-lint-ignore valid-typeof
const CRYPTO_API_SUPPORTED = typeof crypto != UNDEFINED_TYPE;
const subtle = CRYPTO_API_SUPPORTED && crypto.subtle;
const SUBTLE_API_SUPPORTED = CRYPTO_API_SUPPORTED && typeof subtle != UNDEFINED_TYPE;
const codecBytes = codec.bytes;
const Aes = cipher.aes;
const CtrGladman = mode.ctrGladman;
const HmacSha1 = misc.hmacSha1;

let IMPORT_KEY_SUPPORTED = CRYPTO_API_SUPPORTED && SUBTLE_API_SUPPORTED && typeof subtle.importKey == FUNCTION_TYPE;
let DERIVE_BITS_SUPPORTED = CRYPTO_API_SUPPORTED && SUBTLE_API_SUPPORTED && typeof subtle.deriveBits == FUNCTION_TYPE;

class AESDecryptionStream extends TransformStream {

	constructor({ password, rawPassword, signed, encryptionStrength, checkPasswordOnly }) {
		super({
			start() {
				Object.assign(this, {
					ready: new Promise(resolve => this.resolveReady = resolve),
					password: encodePassword(password, rawPassword),
					signed,
					strength: encryptionStrength - 1,
					pending: new Uint8Array()
				});
			},
			async transform(chunk, controller) {
				const aesCrypto = this;
				const {
					password,
					strength,
					resolveReady,
					ready
				} = aesCrypto;
				if (password) {
					await createDecryptionKeys(aesCrypto, strength, password, subarray(chunk, 0, SALT_LENGTH[strength] + 2));
					chunk = subarray(chunk, SALT_LENGTH[strength] + 2);
					if (checkPasswordOnly) {
						controller.error(new Error(ERR_ABORT_CHECK_PASSWORD));
					} else {
						resolveReady();
					}
				} else {
					await ready;
				}
				const output = new Uint8Array(chunk.length - SIGNATURE_LENGTH - ((chunk.length - SIGNATURE_LENGTH) % BLOCK_LENGTH));
				controller.enqueue(append(aesCrypto, chunk, output, 0, SIGNATURE_LENGTH, true));
			},
			async flush(controller) {
				const {
					signed,
					ctr,
					hmac,
					pending,
					ready
				} = this;
				if (hmac && ctr) {
					await ready;
					const chunkToDecrypt = subarray(pending, 0, pending.length - SIGNATURE_LENGTH);
					const originalSignature = subarray(pending, pending.length - SIGNATURE_LENGTH);
					let decryptedChunkArray = new Uint8Array();
					if (chunkToDecrypt.length) {
						const encryptedChunk = toBits(codecBytes, chunkToDecrypt);
						hmac.update(encryptedChunk);
						const decryptedChunk = ctr.update(encryptedChunk);
						decryptedChunkArray = fromBits(codecBytes, decryptedChunk);
					}
					if (signed) {
						const signature = subarray(fromBits(codecBytes, hmac.digest()), 0, SIGNATURE_LENGTH);
						for (let indexSignature = 0; indexSignature < SIGNATURE_LENGTH; indexSignature++) {
							if (signature[indexSignature] != originalSignature[indexSignature]) {
								throw new Error(ERR_INVALID_SIGNATURE);
							}
						}
					}
					controller.enqueue(decryptedChunkArray);
				}
			}
		});
	}
}

class AESEncryptionStream extends TransformStream {

	constructor({ password, rawPassword, encryptionStrength }) {
		// deno-lint-ignore prefer-const
		let stream;
		super({
			start() {
				Object.assign(this, {
					ready: new Promise(resolve => this.resolveReady = resolve),
					password: encodePassword(password, rawPassword),
					strength: encryptionStrength - 1,
					pending: new Uint8Array()
				});
			},
			async transform(chunk, controller) {
				const aesCrypto = this;
				const {
					password,
					strength,
					resolveReady,
					ready
				} = aesCrypto;
				let preamble = new Uint8Array();
				if (password) {
					preamble = await createEncryptionKeys(aesCrypto, strength, password);
					resolveReady();
				} else {
					await ready;
				}
				const output = new Uint8Array(preamble.length + chunk.length - (chunk.length % BLOCK_LENGTH));
				output.set(preamble, 0);
				controller.enqueue(append(aesCrypto, chunk, output, preamble.length, 0));
			},
			async flush(controller) {
				const {
					ctr,
					hmac,
					pending,
					ready
				} = this;
				if (hmac && ctr) {
					await ready;
					let encryptedChunkArray = new Uint8Array();
					if (pending.length) {
						const encryptedChunk = ctr.update(toBits(codecBytes, pending));
						hmac.update(encryptedChunk);
						encryptedChunkArray = fromBits(codecBytes, encryptedChunk);
					}
					stream.signature = fromBits(codecBytes, hmac.digest()).slice(0, SIGNATURE_LENGTH);
					controller.enqueue(concat(encryptedChunkArray, stream.signature));
				}
			}
		});
		stream = this;
	}
}

function append(aesCrypto, input, output, paddingStart, paddingEnd, verifySignature) {
	const {
		ctr,
		hmac,
		pending
	} = aesCrypto;
	const inputLength = input.length - paddingEnd;
	if (pending.length) {
		input = concat(pending, input);
		output = expand(output, inputLength - (inputLength % BLOCK_LENGTH));
	}
	let offset;
	for (offset = 0; offset <= inputLength - BLOCK_LENGTH; offset += BLOCK_LENGTH) {
		const inputChunk = toBits(codecBytes, subarray(input, offset, offset + BLOCK_LENGTH));
		if (verifySignature) {
			hmac.update(inputChunk);
		}
		const outputChunk = ctr.update(inputChunk);
		if (!verifySignature) {
			hmac.update(outputChunk);
		}
		output.set(fromBits(codecBytes, outputChunk), offset + paddingStart);
	}
	aesCrypto.pending = subarray(input, offset);
	return output;
}

async function createDecryptionKeys(decrypt, strength, password, preamble) {
	const passwordVerificationKey = await createKeys$1(decrypt, strength, password, subarray(preamble, 0, SALT_LENGTH[strength]));
	const passwordVerification = subarray(preamble, SALT_LENGTH[strength]);
	if (passwordVerificationKey[0] != passwordVerification[0] || passwordVerificationKey[1] != passwordVerification[1]) {
		throw new Error(ERR_INVALID_PASSWORD);
	}
}

async function createEncryptionKeys(encrypt, strength, password) {
	const salt = getRandomValues(new Uint8Array(SALT_LENGTH[strength]));
	const passwordVerification = await createKeys$1(encrypt, strength, password, salt);
	return concat(salt, passwordVerification);
}

async function createKeys$1(aesCrypto, strength, password, salt) {
	aesCrypto.password = null;
	const baseKey = await importKey(RAW_FORMAT, password, BASE_KEY_ALGORITHM, false, DERIVED_BITS_USAGE);
	const derivedBits = await deriveBits(Object.assign({ salt }, DERIVED_BITS_ALGORITHM), baseKey, 8 * ((KEY_LENGTH[strength] * 2) + 2));
	const compositeKey = new Uint8Array(derivedBits);
	const key = toBits(codecBytes, subarray(compositeKey, 0, KEY_LENGTH[strength]));
	const authentication = toBits(codecBytes, subarray(compositeKey, KEY_LENGTH[strength], KEY_LENGTH[strength] * 2));
	const passwordVerification = subarray(compositeKey, KEY_LENGTH[strength] * 2);
	Object.assign(aesCrypto, {
		keys: {
			key,
			authentication,
			passwordVerification
		},
		ctr: new CtrGladman(new Aes(key), Array.from(COUNTER_DEFAULT_VALUE)),
		hmac: new HmacSha1(authentication)
	});
	return passwordVerification;
}

async function importKey(format, password, algorithm, extractable, keyUsages) {
	if (IMPORT_KEY_SUPPORTED) {
		try {
			return await subtle.importKey(format, password, algorithm, extractable, keyUsages);
		} catch (_error) {
			IMPORT_KEY_SUPPORTED = false;
			return misc.importKey(password);
		}
	} else {
		return misc.importKey(password);
	}
}

async function deriveBits(algorithm, baseKey, length) {
	if (DERIVE_BITS_SUPPORTED) {
		try {
			return await subtle.deriveBits(algorithm, baseKey, length);
		} catch (_error) {
			DERIVE_BITS_SUPPORTED = false;
			return misc.pbkdf2(baseKey, algorithm.salt, DERIVED_BITS_ALGORITHM.iterations, length);
		}
	} else {
		return misc.pbkdf2(baseKey, algorithm.salt, DERIVED_BITS_ALGORITHM.iterations, length);
	}
}

function encodePassword(password, rawPassword) {
	if (rawPassword === UNDEFINED_VALUE) {
		return encodeText(password);
	} else {
		return rawPassword;
	}
}

function concat(leftArray, rightArray) {
	let array = leftArray;
	if (leftArray.length + rightArray.length) {
		array = new Uint8Array(leftArray.length + rightArray.length);
		array.set(leftArray, 0);
		array.set(rightArray, leftArray.length);
	}
	return array;
}

function expand(inputArray, length) {
	if (length && length > inputArray.length) {
		const array = inputArray;
		inputArray = new Uint8Array(length);
		inputArray.set(array, 0);
	}
	return inputArray;
}

function subarray(array, begin, end) {
	return array.subarray(begin, end);
}

function fromBits(codecBytes, chunk) {
	return codecBytes.fromBits(chunk);
}
function toBits(codecBytes, chunk) {
	return codecBytes.toBits(chunk);
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


const HEADER_LENGTH = 12;

class ZipCryptoDecryptionStream extends TransformStream {

	constructor({ password, passwordVerification, checkPasswordOnly }) {
		super({
			start() {
				Object.assign(this, {
					password,
					passwordVerification
				});
				createKeys(this, password);
			},
			transform(chunk, controller) {
				const zipCrypto = this;
				if (zipCrypto.password) {
					const decryptedHeader = decrypt(zipCrypto, chunk.subarray(0, HEADER_LENGTH));
					zipCrypto.password = null;
					if (decryptedHeader[HEADER_LENGTH - 1] != zipCrypto.passwordVerification) {
						throw new Error(ERR_INVALID_PASSWORD);
					}
					chunk = chunk.subarray(HEADER_LENGTH);
				}
				if (checkPasswordOnly) {
					controller.error(new Error(ERR_ABORT_CHECK_PASSWORD));
				} else {
					controller.enqueue(decrypt(zipCrypto, chunk));
				}
			}
		});
	}
}

class ZipCryptoEncryptionStream extends TransformStream {

	constructor({ password, passwordVerification }) {
		super({
			start() {
				Object.assign(this, {
					password,
					passwordVerification
				});
				createKeys(this, password);
			},
			transform(chunk, controller) {
				const zipCrypto = this;
				let output;
				let offset;
				if (zipCrypto.password) {
					zipCrypto.password = null;
					const header = getRandomValues(new Uint8Array(HEADER_LENGTH));
					header[HEADER_LENGTH - 1] = zipCrypto.passwordVerification;
					output = new Uint8Array(chunk.length + header.length);
					output.set(encrypt(zipCrypto, header), 0);
					offset = HEADER_LENGTH;
				} else {
					output = new Uint8Array(chunk.length);
					offset = 0;
				}
				output.set(encrypt(zipCrypto, chunk), offset);
				controller.enqueue(output);
			}
		});
	}
}

function decrypt(target, input) {
	const output = new Uint8Array(input.length);
	for (let index = 0; index < input.length; index++) {
		output[index] = getByte(target) ^ input[index];
		updateKeys(target, output[index]);
	}
	return output;
}

function encrypt(target, input) {
	const output = new Uint8Array(input.length);
	for (let index = 0; index < input.length; index++) {
		output[index] = getByte(target) ^ input[index];
		updateKeys(target, input[index]);
	}
	return output;
}

function createKeys(target, password) {
	const keys = [0x12345678, 0x23456789, 0x34567890];
	Object.assign(target, {
		keys,
		crcKey0: new Crc32(keys[0]),
		crcKey2: new Crc32(keys[2]),
	});
	for (let index = 0; index < password.length; index++) {
		updateKeys(target, password.charCodeAt(index));
	}
}

function updateKeys(target, byte) {
	let [key0, key1, key2] = target.keys;
	target.crcKey0.append([byte]);
	key0 = ~target.crcKey0.get();
	key1 = getInt32(Math.imul(getInt32(key1 + getInt8(key0)), 134775813) + 1);
	target.crcKey2.append([key1 >>> 24]);
	key2 = ~target.crcKey2.get();
	target.keys = [key0, key1, key2];
}

function getByte(target) {
	const temp = target.keys[2] | 2;
	return getInt8(Math.imul(temp, (temp ^ 1)) >>> 8);
}

function getInt8(number) {
	return number & 0xFF;
}

function getInt32(number) {
	return number & 0xFFFFFFFF;
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


const COMPRESSION_FORMAT = "deflate-raw";

class DeflateStream extends TransformStream {

	constructor(options, { chunkSize, CompressionStream, CompressionStreamNative }) {
		super({});
		const { compressed, encrypted, useCompressionStream, zipCrypto, signed, level } = options;
		const stream = this;
		let crc32Stream, encryptionStream;
		let readable = filterEmptyChunks(super.readable);
		if ((!encrypted || zipCrypto) && signed) {
			crc32Stream = new Crc32Stream();
			readable = pipeThrough(readable, crc32Stream);
		}
		if (compressed) {
			readable = pipeThroughCommpressionStream(readable, useCompressionStream, { level, chunkSize }, CompressionStreamNative, CompressionStream);
		}
		if (encrypted) {
			if (zipCrypto) {
				readable = pipeThrough(readable, new ZipCryptoEncryptionStream(options));
			} else {
				encryptionStream = new AESEncryptionStream(options);
				readable = pipeThrough(readable, encryptionStream);
			}
		}
		setReadable(stream, readable, () => {
			let signature;
			if (encrypted && !zipCrypto) {
				signature = encryptionStream.signature;
			}
			if ((!encrypted || zipCrypto) && signed) {
				signature = new DataView(crc32Stream.value.buffer).getUint32(0);
			}
			stream.signature = signature;
		});
	}
}

class InflateStream extends TransformStream {

	constructor(options, { chunkSize, DecompressionStream, DecompressionStreamNative }) {
		super({});
		const { zipCrypto, encrypted, signed, signature, compressed, useCompressionStream } = options;
		let crc32Stream, decryptionStream;
		let readable = filterEmptyChunks(super.readable);
		if (encrypted) {
			if (zipCrypto) {
				readable = pipeThrough(readable, new ZipCryptoDecryptionStream(options));
			} else {
				decryptionStream = new AESDecryptionStream(options);
				readable = pipeThrough(readable, decryptionStream);
			}
		}
		if (compressed) {
			readable = pipeThroughCommpressionStream(readable, useCompressionStream, { chunkSize }, DecompressionStreamNative, DecompressionStream);
		}
		if ((!encrypted || zipCrypto) && signed) {
			crc32Stream = new Crc32Stream();
			readable = pipeThrough(readable, crc32Stream);
		}
		setReadable(this, readable, () => {
			if ((!encrypted || zipCrypto) && signed) {
				const dataViewSignature = new DataView(crc32Stream.value.buffer);
				if (signature != dataViewSignature.getUint32(0, false)) {
					throw new Error(ERR_INVALID_SIGNATURE);
				}
			}
		});
	}
}

function filterEmptyChunks(readable) {
	return pipeThrough(readable, new TransformStream({
		transform(chunk, controller) {
			if (chunk && chunk.length) {
				controller.enqueue(chunk);
			}
		}
	}));
}

function setReadable(stream, readable, flush) {
	readable = pipeThrough(readable, new TransformStream({ flush }));
	Object.defineProperty(stream, "readable", {
		get() {
			return readable;
		}
	});
}

function pipeThroughCommpressionStream(readable, useCompressionStream, options, CodecStreamNative, CodecStream) {
	try {
		const CompressionStream = useCompressionStream && CodecStreamNative ? CodecStreamNative : CodecStream;
		readable = pipeThrough(readable, new CompressionStream(COMPRESSION_FORMAT, options));
	} catch (error) {
		if (useCompressionStream) {
			try {
				readable = pipeThrough(readable, new CodecStream(COMPRESSION_FORMAT, options));
			} catch (error) {
				return readable;
			}
		} else {
			return readable;
		}
	}
	return readable;
}

function pipeThrough(readable, transformStream) {
	return readable.pipeThrough(transformStream);
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


const MESSAGE_EVENT_TYPE = "message";
const MESSAGE_START = "start";
const MESSAGE_PULL = "pull";
const MESSAGE_DATA = "data";
const MESSAGE_ACK_DATA = "ack";
const MESSAGE_CLOSE = "close";
const CODEC_DEFLATE = "deflate";
const CODEC_INFLATE = "inflate";

class CodecStream extends TransformStream {

	constructor(options, config) {
		super({});
		const codec = this;
		const { codecType } = options;
		let Stream;
		if (codecType.startsWith(CODEC_DEFLATE)) {
			Stream = DeflateStream;
		} else if (codecType.startsWith(CODEC_INFLATE)) {
			Stream = InflateStream;
		}
		let outputSize = 0;
		let inputSize = 0;
		const stream = new Stream(options, config);
		const readable = super.readable;
		const inputSizeStream = new TransformStream({
			transform(chunk, controller) {
				if (chunk && chunk.length) {
					inputSize += chunk.length;
					controller.enqueue(chunk);
				}
			},
			flush() {
				Object.assign(codec, {
					inputSize
				});
			}
		});
		const outputSizeStream = new TransformStream({
			transform(chunk, controller) {
				if (chunk && chunk.length) {
					outputSize += chunk.length;
					controller.enqueue(chunk);
				}
			},
			flush() {
				const { signature } = stream;
				Object.assign(codec, {
					signature,
					outputSize,
					inputSize
				});
			}
		});
		Object.defineProperty(codec, "readable", {
			get() {
				return readable.pipeThrough(inputSizeStream).pipeThrough(stream).pipeThrough(outputSizeStream);
			}
		});
	}
}

class ChunkStream extends TransformStream {

	constructor(chunkSize) {
		let pendingChunk;
		super({
			transform,
			flush(controller) {
				if (pendingChunk && pendingChunk.length) {
					controller.enqueue(pendingChunk);
				}
			}
		});

		function transform(chunk, controller) {
			if (pendingChunk) {
				const newChunk = new Uint8Array(pendingChunk.length + chunk.length);
				newChunk.set(pendingChunk);
				newChunk.set(chunk, pendingChunk.length);
				chunk = newChunk;
				pendingChunk = null;
			}
			if (chunk.length > chunkSize) {
				controller.enqueue(chunk.slice(0, chunkSize));
				transform(chunk.slice(chunkSize), controller);
			} else {
				pendingChunk = chunk;
			}
		}
	}
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


// deno-lint-ignore valid-typeof
let WEB_WORKERS_SUPPORTED = typeof Worker != UNDEFINED_TYPE;

class CodecWorker {

	constructor(workerData, { readable, writable }, { options, config, streamOptions, useWebWorkers, transferStreams, scripts }, onTaskFinished) {
		const { signal } = streamOptions;
		Object.assign(workerData, {
			busy: true,
			readable: readable
				.pipeThrough(new ChunkStream(config.chunkSize))
				.pipeThrough(new ProgressWatcherStream(readable, streamOptions), { signal }),
			writable,
			options: Object.assign({}, options),
			scripts,
			transferStreams,
			terminate() {
				return new Promise(resolve => {
					const { worker, busy } = workerData;
					if (worker) {
						if (busy) {
							workerData.resolveTerminated = resolve;
						} else {
							worker.terminate();
							resolve();
						}
						workerData.interface = null;
					} else {
						resolve();
					}
				});
			},
			onTaskFinished() {
				const { resolveTerminated } = workerData;
				if (resolveTerminated) {
					workerData.resolveTerminated = null;
					workerData.terminated = true;
					workerData.worker.terminate();
					resolveTerminated();
				}
				workerData.busy = false;
				onTaskFinished(workerData);
			}
		});
		return (useWebWorkers && WEB_WORKERS_SUPPORTED ? createWebWorkerInterface : createWorkerInterface)(workerData, config);
	}
}

class ProgressWatcherStream extends TransformStream {

	constructor(readableSource, { onstart, onprogress, size, onend }) {
		let chunkOffset = 0;
		super({
			async start() {
				if (onstart) {
					await callHandler(onstart, size);
				}
			},
			async transform(chunk, controller) {
				chunkOffset += chunk.length;
				if (onprogress) {
					await callHandler(onprogress, chunkOffset, size);
				}
				controller.enqueue(chunk);
			},
			async flush() {
				readableSource.size = chunkOffset;
				if (onend) {
					await callHandler(onend, chunkOffset);
				}
			}
		});
	}
}

async function callHandler(handler, ...parameters) {
	try {
		await handler(...parameters);
	} catch (_error) {
		// ignored
	}
}

function createWorkerInterface(workerData, config) {
	return {
		run: () => runWorker$1(workerData, config)
	};
}

function createWebWorkerInterface(workerData, config) {
	const { baseURL, chunkSize } = config;
	if (!workerData.interface) {
		let worker;
		try {
			worker = getWebWorker(workerData.scripts[0], baseURL, workerData);
		} catch (error) {
			WEB_WORKERS_SUPPORTED = false;
			return createWorkerInterface(workerData, config);
		}
		Object.assign(workerData, {
			worker,
			interface: {
				run: () => runWebWorker(workerData, { chunkSize })
			}
		});
	}
	return workerData.interface;
}

async function runWorker$1({ options, readable, writable, onTaskFinished }, config) {
	try {
		const codecStream = new CodecStream(options, config);
		await readable.pipeThrough(codecStream).pipeTo(writable, { preventClose: true, preventAbort: true });
		const {
			signature,
			inputSize,
			outputSize
		} = codecStream;
		return {
			signature,
			inputSize,
			outputSize
		};
	} finally {
		onTaskFinished();
	}
}

async function runWebWorker(workerData, config) {
	let resolveResult, rejectResult;
	const result = new Promise((resolve, reject) => {
		resolveResult = resolve;
		rejectResult = reject;
	});
	Object.assign(workerData, {
		reader: null,
		writer: null,
		resolveResult,
		rejectResult,
		result
	});
	const { readable, options, scripts } = workerData;
	const { writable, closed } = watchClosedStream(workerData.writable);
	const streamsTransferred = sendMessage({
		type: MESSAGE_START,
		scripts: scripts.slice(1),
		options,
		config,
		readable,
		writable
	}, workerData);
	if (!streamsTransferred) {
		Object.assign(workerData, {
			reader: readable.getReader(),
			writer: writable.getWriter()
		});
	}
	const resultValue = await result;
	if (!streamsTransferred) {
		await writable.getWriter().close();
	}
	await closed;
	return resultValue;
}

function watchClosedStream(writableSource) {
	let resolveStreamClosed;
	const closed = new Promise(resolve => resolveStreamClosed = resolve);
	const writable = new WritableStream({
		async write(chunk) {
			const writer = writableSource.getWriter();
			await writer.ready;
			await writer.write(chunk);
			writer.releaseLock();
		},
		close() {
			resolveStreamClosed();
		},
		abort(reason) {
			const writer = writableSource.getWriter();
			return writer.abort(reason);
		}
	});
	return { writable, closed };
}

let classicWorkersSupported = true;
let transferStreamsSupported = true;

function getWebWorker(url, baseURL, workerData) {
	const workerOptions = { type: "module" };
	let scriptUrl, worker;
	// deno-lint-ignore valid-typeof
	if (typeof url == FUNCTION_TYPE) {
		url = url();
	}
	try {
		scriptUrl = new URL(url, baseURL);
	} catch (_error) {
		scriptUrl = url;
	}
	if (classicWorkersSupported) {
		try {
			worker = new Worker(scriptUrl);
		} catch (_error) {
			classicWorkersSupported = false;
			worker = new Worker(scriptUrl, workerOptions);
		}
	} else {
		worker = new Worker(scriptUrl, workerOptions);
	}
	worker.addEventListener(MESSAGE_EVENT_TYPE, event => onMessage(event, workerData));
	return worker;
}

function sendMessage(message, { worker, writer, onTaskFinished, transferStreams }) {
	try {
		let { value, readable, writable } = message;
		const transferables = [];
		if (value) {
			if (value.byteLength < value.buffer.byteLength) {
				message.value = value.buffer.slice(0, value.byteLength);
			}
			else {
				message.value = value.buffer;
			}
			transferables.push(message.value);
		}
		if (transferStreams && transferStreamsSupported) {
			if (readable) {
				transferables.push(readable);
			}
			if (writable) {
				transferables.push(writable);
			}
		} else {
			message.readable = message.writable = null;
		}
		if (transferables.length) {
			try {
				worker.postMessage(message, transferables);
				return true;
			} catch (_error) {
				transferStreamsSupported = false;
				message.readable = message.writable = null;
				worker.postMessage(message);
			}
		} else {
			worker.postMessage(message);
		}
	} catch (error) {
		if (writer) {
			writer.releaseLock();
		}
		onTaskFinished();
		throw error;
	}
}

async function onMessage({ data }, workerData) {
	const { type, value, messageId, result, error } = data;
	const { reader, writer, resolveResult, rejectResult, onTaskFinished } = workerData;
	try {
		if (error) {
			const { message, stack, code, name } = error;
			const responseError = new Error(message);
			Object.assign(responseError, { stack, code, name });
			close(responseError);
		} else {
			if (type == MESSAGE_PULL) {
				const { value, done } = await reader.read();
				sendMessage({ type: MESSAGE_DATA, value, done, messageId }, workerData);
			}
			if (type == MESSAGE_DATA) {
				await writer.ready;
				await writer.write(new Uint8Array(value));
				sendMessage({ type: MESSAGE_ACK_DATA, messageId }, workerData);
			}
			if (type == MESSAGE_CLOSE) {
				close(null, result);
			}
		}
	} catch (error) {
		sendMessage({ type: MESSAGE_CLOSE, messageId }, workerData);
		close(error);
	}

	function close(error, result) {
		if (error) {
			rejectResult(error);
		} else {
			resolveResult(result);
		}
		if (writer) {
			writer.releaseLock();
		}
		onTaskFinished();
	}
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


let pool = [];
const pendingRequests = [];

let indexWorker = 0;

async function runWorker(stream, workerOptions) {
	const { options, config } = workerOptions;
	const { transferStreams, useWebWorkers, useCompressionStream, codecType, compressed, signed, encrypted } = options;
	const { workerScripts, maxWorkers } = config;
	workerOptions.transferStreams = transferStreams || transferStreams === UNDEFINED_VALUE;
	const streamCopy = !compressed && !signed && !encrypted && !workerOptions.transferStreams;
	workerOptions.useWebWorkers = !streamCopy && (useWebWorkers || (useWebWorkers === UNDEFINED_VALUE && config.useWebWorkers));
	workerOptions.scripts = workerOptions.useWebWorkers && workerScripts ? workerScripts[codecType] : [];
	options.useCompressionStream = useCompressionStream || (useCompressionStream === UNDEFINED_VALUE && config.useCompressionStream);
	return (await getWorker()).run();

	async function getWorker() {
		const workerData = pool.find(workerData => !workerData.busy);
		if (workerData) {
			clearTerminateTimeout(workerData);
			return new CodecWorker(workerData, stream, workerOptions, onTaskFinished);
		} else if (pool.length < maxWorkers) {
			const workerData = { indexWorker };
			indexWorker++;
			pool.push(workerData);
			return new CodecWorker(workerData, stream, workerOptions, onTaskFinished);
		} else {
			return new Promise(resolve => pendingRequests.push({ resolve, stream, workerOptions }));
		}
	}

	function onTaskFinished(workerData) {
		if (pendingRequests.length) {
			const [{ resolve, stream, workerOptions }] = pendingRequests.splice(0, 1);
			resolve(new CodecWorker(workerData, stream, workerOptions, onTaskFinished));
		} else if (workerData.worker) {
			clearTerminateTimeout(workerData);
			terminateWorker(workerData, workerOptions);
		} else {
			pool = pool.filter(data => data != workerData);
		}
	}
}

function terminateWorker(workerData, workerOptions) {
	const { config } = workerOptions;
	const { terminateWorkerTimeout } = config;
	if (Number.isFinite(terminateWorkerTimeout) && terminateWorkerTimeout >= 0) {
		if (workerData.terminated) {
			workerData.terminated = false;
		} else {
			workerData.terminateTimeout = setTimeout(async () => {
				pool = pool.filter(data => data != workerData);
				try {
					await workerData.terminate();
				} catch (_error) {
					// ignored
				}
			}, terminateWorkerTimeout);
		}
	}
}

function clearTerminateTimeout(workerData) {
	const { terminateTimeout } = workerData;
	if (terminateTimeout) {
		clearTimeout(terminateTimeout);
		workerData.terminateTimeout = null;
	}
}

async function terminateWorkers() {
	await Promise.allSettled(pool.map(workerData => {
		clearTerminateTimeout(workerData);
		return workerData.terminate();
	}));
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


const ERR_HTTP_STATUS = "HTTP error ";
const ERR_HTTP_RANGE = "HTTP Range not supported";
const ERR_ITERATOR_COMPLETED_TOO_SOON = "Writer iterator completed too soon";

const CONTENT_TYPE_TEXT_PLAIN = "text/plain";
const HTTP_HEADER_CONTENT_LENGTH = "Content-Length";
const HTTP_HEADER_CONTENT_RANGE = "Content-Range";
const HTTP_HEADER_ACCEPT_RANGES = "Accept-Ranges";
const HTTP_HEADER_RANGE = "Range";
const HTTP_HEADER_CONTENT_TYPE = "Content-Type";
const HTTP_METHOD_HEAD = "HEAD";
const HTTP_METHOD_GET = "GET";
const HTTP_RANGE_UNIT = "bytes";
const DEFAULT_CHUNK_SIZE = 64 * 1024;

const PROPERTY_NAME_WRITABLE = "writable";

class Stream {

	constructor() {
		this.size = 0;
	}

	init() {
		this.initialized = true;
	}
}

class Reader extends Stream {

	get readable() {
		const reader = this;
		const { chunkSize = DEFAULT_CHUNK_SIZE } = reader;
		const readable = new ReadableStream({
			start() {
				this.chunkOffset = 0;
			},
			async pull(controller) {
				const { offset = 0, size, diskNumberStart } = readable;
				const { chunkOffset } = this;
				controller.enqueue(await readUint8Array(reader, offset + chunkOffset, Math.min(chunkSize, size - chunkOffset), diskNumberStart));
				if (chunkOffset + chunkSize > size) {
					controller.close();
				} else {
					this.chunkOffset += chunkSize;
				}
			}
		});
		return readable;
	}
}

class Writer extends Stream {

	constructor() {
		super();
		const writer = this;
		const writable = new WritableStream({
			write(chunk) {
				return writer.writeUint8Array(chunk);
			}
		});
		Object.defineProperty(writer, PROPERTY_NAME_WRITABLE, {
			get() {
				return writable;
			}
		});
	}

	writeUint8Array() {
		// abstract
	}
}

class Data64URIReader extends Reader {

	constructor(dataURI) {
		super();
		let dataEnd = dataURI.length;
		while (dataURI.charAt(dataEnd - 1) == "=") {
			dataEnd--;
		}
		const dataStart = dataURI.indexOf(",") + 1;
		Object.assign(this, {
			dataURI,
			dataStart,
			size: Math.floor((dataEnd - dataStart) * 0.75)
		});
	}

	readUint8Array(offset, length) {
		const {
			dataStart,
			dataURI
		} = this;
		const dataArray = new Uint8Array(length);
		const start = Math.floor(offset / 3) * 4;
		const bytes = atob(dataURI.substring(start + dataStart, Math.ceil((offset + length) / 3) * 4 + dataStart));
		const delta = offset - Math.floor(start / 4) * 3;
		for (let indexByte = delta; indexByte < delta + length; indexByte++) {
			dataArray[indexByte - delta] = bytes.charCodeAt(indexByte);
		}
		return dataArray;
	}
}

class Data64URIWriter extends Writer {

	constructor(contentType) {
		super();
		Object.assign(this, {
			data: "data:" + (contentType || "") + ";base64,",
			pending: []
		});
	}

	writeUint8Array(array) {
		const writer = this;
		let indexArray = 0;
		let dataString = writer.pending;
		const delta = writer.pending.length;
		writer.pending = "";
		for (indexArray = 0; indexArray < (Math.floor((delta + array.length) / 3) * 3) - delta; indexArray++) {
			dataString += String.fromCharCode(array[indexArray]);
		}
		for (; indexArray < array.length; indexArray++) {
			writer.pending += String.fromCharCode(array[indexArray]);
		}
		if (dataString.length > 2) {
			writer.data += btoa(dataString);
		} else {
			writer.pending = dataString;
		}
	}

	getData() {
		return this.data + btoa(this.pending);
	}
}

class BlobReader extends Reader {

	constructor(blob) {
		super();
		Object.assign(this, {
			blob,
			size: blob.size
		});
	}

	async readUint8Array(offset, length) {
		const reader = this;
		const offsetEnd = offset + length;
		const blob = offset || offsetEnd < reader.size ? reader.blob.slice(offset, offsetEnd) : reader.blob;
		let arrayBuffer = await blob.arrayBuffer();
		if (arrayBuffer.byteLength > length) {
			arrayBuffer = arrayBuffer.slice(offset, offsetEnd);
		}
		return new Uint8Array(arrayBuffer);
	}
}

class BlobWriter extends Stream {

	constructor(contentType) {
		super();
		const writer = this;
		const transformStream = new TransformStream();
		const headers = [];
		if (contentType) {
			headers.push([HTTP_HEADER_CONTENT_TYPE, contentType]);
		}
		Object.defineProperty(writer, PROPERTY_NAME_WRITABLE, {
			get() {
				return transformStream.writable;
			}
		});
		writer.blob = new Response(transformStream.readable, { headers }).blob();
	}

	getData() {
		return this.blob;
	}
}

class TextReader extends BlobReader {

	constructor(text) {
		super(new Blob([text], { type: CONTENT_TYPE_TEXT_PLAIN }));
	}
}

class TextWriter extends BlobWriter {

	constructor(encoding) {
		super(encoding);
		Object.assign(this, {
			encoding,
			utf8: !encoding || encoding.toLowerCase() == "utf-8"
		});
	}

	async getData() {
		const {
			encoding,
			utf8
		} = this;
		const blob = await super.getData();
		if (blob.text && utf8) {
			return blob.text();
		} else {
			const reader = new FileReader();
			return new Promise((resolve, reject) => {
				Object.assign(reader, {
					onload: ({ target }) => resolve(target.result),
					onerror: () => reject(reader.error)
				});
				reader.readAsText(blob, encoding);
			});
		}
	}
}

class FetchReader extends Reader {

	constructor(url, options) {
		super();
		createHttpReader(this, url, options);
	}

	async init() {
		await initHttpReader(this, sendFetchRequest, getFetchRequestData);
		super.init();
	}

	readUint8Array(index, length) {
		return readUint8ArrayHttpReader(this, index, length, sendFetchRequest, getFetchRequestData);
	}
}

class XHRReader extends Reader {

	constructor(url, options) {
		super();
		createHttpReader(this, url, options);
	}

	async init() {
		await initHttpReader(this, sendXMLHttpRequest, getXMLHttpRequestData);
		super.init();
	}

	readUint8Array(index, length) {
		return readUint8ArrayHttpReader(this, index, length, sendXMLHttpRequest, getXMLHttpRequestData);
	}
}

function createHttpReader(httpReader, url, options) {
	const {
		preventHeadRequest,
		useRangeHeader,
		forceRangeRequests,
		combineSizeEocd
	} = options;
	options = Object.assign({}, options);
	delete options.preventHeadRequest;
	delete options.useRangeHeader;
	delete options.forceRangeRequests;
	delete options.combineSizeEocd;
	delete options.useXHR;
	Object.assign(httpReader, {
		url,
		options,
		preventHeadRequest,
		useRangeHeader,
		forceRangeRequests,
		combineSizeEocd
	});
}

async function initHttpReader(httpReader, sendRequest, getRequestData) {
	const {
		url,
		preventHeadRequest,
		useRangeHeader,
		forceRangeRequests,
		combineSizeEocd
	} = httpReader;
	if (isHttpFamily(url) && (useRangeHeader || forceRangeRequests) && (typeof preventHeadRequest == "undefined" || preventHeadRequest)) {
		const response = await sendRequest(HTTP_METHOD_GET, httpReader, getRangeHeaders(httpReader, combineSizeEocd ? -END_OF_CENTRAL_DIR_LENGTH : undefined));
		if (!forceRangeRequests && response.headers.get(HTTP_HEADER_ACCEPT_RANGES) != HTTP_RANGE_UNIT) {
			throw new Error(ERR_HTTP_RANGE);
		} else {
			if (combineSizeEocd) {
				httpReader.eocdCache = new Uint8Array(await response.arrayBuffer());
			}
			let contentSize;
			const contentRangeHeader = response.headers.get(HTTP_HEADER_CONTENT_RANGE);
			if (contentRangeHeader) {
				const splitHeader = contentRangeHeader.trim().split(/\s*\/\s*/);
				if (splitHeader.length) {
					const headerValue = splitHeader[1];
					if (headerValue && headerValue != "*") {
						contentSize = Number(headerValue);
					}
				}
			}
			if (contentSize === UNDEFINED_VALUE) {
				await getContentLength(httpReader, sendRequest, getRequestData);
			} else {
				httpReader.size = contentSize;
			}
		}
	} else {
		await getContentLength(httpReader, sendRequest, getRequestData);
	}
}

async function readUint8ArrayHttpReader(httpReader, index, length, sendRequest, getRequestData) {
	const {
		useRangeHeader,
		forceRangeRequests,
		eocdCache,
		size,
		options
	} = httpReader;
	if (useRangeHeader || forceRangeRequests) {
		if (eocdCache && index == size - END_OF_CENTRAL_DIR_LENGTH && length == END_OF_CENTRAL_DIR_LENGTH) {
			return eocdCache;
		}
		const response = await sendRequest(HTTP_METHOD_GET, httpReader, getRangeHeaders(httpReader, index, length));
		if (response.status != 206) {
			throw new Error(ERR_HTTP_RANGE);
		}
		return new Uint8Array(await response.arrayBuffer());
	} else {
		const { data } = httpReader;
		if (!data) {
			await getRequestData(httpReader, options);
		}
		return new Uint8Array(httpReader.data.subarray(index, index + length));
	}
}

function getRangeHeaders(httpReader, index = 0, length = 1) {
	return Object.assign({}, getHeaders(httpReader), { [HTTP_HEADER_RANGE]: HTTP_RANGE_UNIT + "=" + (index < 0 ? index : index + "-" + (index + length - 1)) });
}

function getHeaders({ options }) {
	const { headers } = options;
	if (headers) {
		if (Symbol.iterator in headers) {
			return Object.fromEntries(headers);
		} else {
			return headers;
		}
	}
}

async function getFetchRequestData(httpReader) {
	await getRequestData(httpReader, sendFetchRequest);
}

async function getXMLHttpRequestData(httpReader) {
	await getRequestData(httpReader, sendXMLHttpRequest);
}

async function getRequestData(httpReader, sendRequest) {
	const response = await sendRequest(HTTP_METHOD_GET, httpReader, getHeaders(httpReader));
	httpReader.data = new Uint8Array(await response.arrayBuffer());
	if (!httpReader.size) {
		httpReader.size = httpReader.data.length;
	}
}

async function getContentLength(httpReader, sendRequest, getRequestData) {
	if (httpReader.preventHeadRequest) {
		await getRequestData(httpReader, httpReader.options);
	} else {
		const response = await sendRequest(HTTP_METHOD_HEAD, httpReader, getHeaders(httpReader));
		const contentLength = response.headers.get(HTTP_HEADER_CONTENT_LENGTH);
		if (contentLength) {
			httpReader.size = Number(contentLength);
		} else {
			await getRequestData(httpReader, httpReader.options);
		}
	}
}

async function sendFetchRequest(method, { options, url }, headers) {
	const response = await fetch(url, Object.assign({}, options, { method, headers }));
	if (response.status < 400) {
		return response;
	} else {
		throw response.status == 416 ? new Error(ERR_HTTP_RANGE) : new Error(ERR_HTTP_STATUS + (response.statusText || response.status));
	}
}

function sendXMLHttpRequest(method, { url }, headers) {
	return new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.addEventListener("load", () => {
			if (request.status < 400) {
				const headers = [];
				request.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(header => {
					const splitHeader = header.trim().split(/\s*:\s*/);
					splitHeader[0] = splitHeader[0].trim().replace(/^[a-z]|-[a-z]/g, value => value.toUpperCase());
					headers.push(splitHeader);
				});
				resolve({
					status: request.status,
					arrayBuffer: () => request.response,
					headers: new Map(headers)
				});
			} else {
				reject(request.status == 416 ? new Error(ERR_HTTP_RANGE) : new Error(ERR_HTTP_STATUS + (request.statusText || request.status)));
			}
		}, false);
		request.addEventListener("error", event => reject(event.detail ? event.detail.error : new Error("Network error")), false);
		request.open(method, url);
		if (headers) {
			for (const entry of Object.entries(headers)) {
				request.setRequestHeader(entry[0], entry[1]);
			}
		}
		request.responseType = "arraybuffer";
		request.send();
	});
}

class HttpReader extends Reader {

	constructor(url, options = {}) {
		super();
		Object.assign(this, {
			url,
			reader: options.useXHR ? new XHRReader(url, options) : new FetchReader(url, options)
		});
	}

	set size(value) {
		// ignored
	}

	get size() {
		return this.reader.size;
	}

	async init() {
		await this.reader.init();
		super.init();
	}

	readUint8Array(index, length) {
		return this.reader.readUint8Array(index, length);
	}
}

class HttpRangeReader extends HttpReader {

	constructor(url, options = {}) {
		options.useRangeHeader = true;
		super(url, options);
	}
}


class Uint8ArrayReader extends Reader {

	constructor(array) {
		super();
		Object.assign(this, {
			array,
			size: array.length
		});
	}

	readUint8Array(index, length) {
		return this.array.slice(index, index + length);
	}
}

class Uint8ArrayWriter extends Writer {

	init(initSize = 0) {
		Object.assign(this, {
			offset: 0,
			array: new Uint8Array(initSize)
		});
		super.init();
	}

	writeUint8Array(array) {
		const writer = this;
		if (writer.offset + array.length > writer.array.length) {
			const previousArray = writer.array;
			writer.array = new Uint8Array(previousArray.length + array.length);
			writer.array.set(previousArray);
		}
		writer.array.set(array, writer.offset);
		writer.offset += array.length;
	}

	getData() {
		return this.array;
	}
}

class SplitDataReader extends Reader {

	constructor(readers) {
		super();
		this.readers = readers;
	}

	async init() {
		const reader = this;
		const { readers } = reader;
		reader.lastDiskNumber = 0;
		reader.lastDiskOffset = 0;
		await Promise.all(readers.map(async (diskReader, indexDiskReader) => {
			await diskReader.init();
			if (indexDiskReader != readers.length - 1) {
				reader.lastDiskOffset += diskReader.size;
			}
			reader.size += diskReader.size;
		}));
		super.init();
	}

	async readUint8Array(offset, length, diskNumber = 0) {
		const reader = this;
		const { readers } = this;
		let result;
		let currentDiskNumber = diskNumber;
		if (currentDiskNumber == -1) {
			currentDiskNumber = readers.length - 1;
		}
		let currentReaderOffset = offset;
		while (currentReaderOffset >= readers[currentDiskNumber].size) {
			currentReaderOffset -= readers[currentDiskNumber].size;
			currentDiskNumber++;
		}
		const currentReader = readers[currentDiskNumber];
		const currentReaderSize = currentReader.size;
		if (currentReaderOffset + length <= currentReaderSize) {
			result = await readUint8Array(currentReader, currentReaderOffset, length);
		} else {
			const chunkLength = currentReaderSize - currentReaderOffset;
			result = new Uint8Array(length);
			result.set(await readUint8Array(currentReader, currentReaderOffset, chunkLength));
			result.set(await reader.readUint8Array(offset + chunkLength, length - chunkLength, diskNumber), chunkLength);
		}
		reader.lastDiskNumber = Math.max(currentDiskNumber, reader.lastDiskNumber);
		return result;
	}
}

class SplitDataWriter extends Stream {

	constructor(writerGenerator, maxSize = 4294967295) {
		super();
		const writer = this;
		Object.assign(writer, {
			diskNumber: 0,
			diskOffset: 0,
			size: 0,
			maxSize,
			availableSize: maxSize
		});
		let diskSourceWriter, diskWritable, diskWriter;
		const writable = new WritableStream({
			async write(chunk) {
				const { availableSize } = writer;
				if (!diskWriter) {
					const { value, done } = await writerGenerator.next();
					if (done && !value) {
						throw new Error(ERR_ITERATOR_COMPLETED_TOO_SOON);
					} else {
						diskSourceWriter = value;
						diskSourceWriter.size = 0;
						if (diskSourceWriter.maxSize) {
							writer.maxSize = diskSourceWriter.maxSize;
						}
						writer.availableSize = writer.maxSize;
						await initStream(diskSourceWriter);
						diskWritable = value.writable;
						diskWriter = diskWritable.getWriter();
					}
					await this.write(chunk);
				} else if (chunk.length >= availableSize) {
					await writeChunk(chunk.slice(0, availableSize));
					await closeDisk();
					writer.diskOffset += diskSourceWriter.size;
					writer.diskNumber++;
					diskWriter = null;
					await this.write(chunk.slice(availableSize));
				} else {
					await writeChunk(chunk);
				}
			},
			async close() {
				await diskWriter.ready;
				await closeDisk();
			}
		});
		Object.defineProperty(writer, PROPERTY_NAME_WRITABLE, {
			get() {
				return writable;
			}
		});

		async function writeChunk(chunk) {
			const chunkLength = chunk.length;
			if (chunkLength) {
				await diskWriter.ready;
				await diskWriter.write(chunk);
				diskSourceWriter.size += chunkLength;
				writer.size += chunkLength;
				writer.availableSize -= chunkLength;
			}
		}

		async function closeDisk() {
			diskWritable.size = diskSourceWriter.size;
			await diskWriter.close();
		}
	}
}

function isHttpFamily(url) {
	const { baseURL } = getConfiguration();
	const { protocol } = new URL(url, baseURL);
	return protocol == "http:" || protocol == "https:";
}

async function initStream(stream, initSize) {
	if (stream.init && !stream.initialized) {
		await stream.init(initSize);
	} else {
		return Promise.resolve();
	}
}

function initReader(reader) {
	if (Array.isArray(reader)) {
		reader = new SplitDataReader(reader);
	}
	if (reader instanceof ReadableStream) {
		reader = {
			readable: reader
		};
	}
	return reader;
}

function initWriter(writer) {
	if (writer.writable === UNDEFINED_VALUE && typeof writer.next == FUNCTION_TYPE) {
		writer = new SplitDataWriter(writer);
	}
	if (writer instanceof WritableStream) {
		writer = {
			writable: writer
		};
	}
	const { writable } = writer;
	if (writable.size === UNDEFINED_VALUE) {
		writable.size = 0;
	}
	if (!(writer instanceof SplitDataWriter)) {
		Object.assign(writer, {
			diskNumber: 0,
			diskOffset: 0,
			availableSize: Infinity,
			maxSize: Infinity
		});
	}
	return writer;
}

function readUint8Array(reader, offset, size, diskNumber) {
	return reader.readUint8Array(offset, size, diskNumber);
}

const SplitZipReader = SplitDataReader;
const SplitZipWriter = SplitDataWriter;

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* global TextDecoder */

const CP437 = "\0☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼ !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ".split("");
const VALID_CP437 = CP437.length == 256;

function decodeCP437(stringValue) {
	if (VALID_CP437) {
		let result = "";
		for (let indexCharacter = 0; indexCharacter < stringValue.length; indexCharacter++) {
			result += CP437[stringValue[indexCharacter]];
		}
		return result;
	} else {
		return new TextDecoder().decode(stringValue);
	}
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


function decodeText(value, encoding) {
	if (encoding && encoding.trim().toLowerCase() == "cp437") {
		return decodeCP437(value);
	} else {
		return new TextDecoder(encoding).decode(value);
	}
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const PROPERTY_NAME_FILENAME = "filename";
const PROPERTY_NAME_RAW_FILENAME = "rawFilename";
const PROPERTY_NAME_COMMENT = "comment";
const PROPERTY_NAME_RAW_COMMENT = "rawComment";
const PROPERTY_NAME_UNCOMPPRESSED_SIZE = "uncompressedSize";
const PROPERTY_NAME_COMPPRESSED_SIZE = "compressedSize";
const PROPERTY_NAME_OFFSET = "offset";
const PROPERTY_NAME_DISK_NUMBER_START = "diskNumberStart";
const PROPERTY_NAME_LAST_MODIFICATION_DATE = "lastModDate";
const PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE = "rawLastModDate";
const PROPERTY_NAME_LAST_ACCESS_DATE = "lastAccessDate";
const PROPERTY_NAME_RAW_LAST_ACCESS_DATE = "rawLastAccessDate";
const PROPERTY_NAME_CREATION_DATE = "creationDate";
const PROPERTY_NAME_RAW_CREATION_DATE = "rawCreationDate";
const PROPERTY_NAME_INTERNAL_FILE_ATTRIBUTE = "internalFileAttribute";
const PROPERTY_NAME_EXTERNAL_FILE_ATTRIBUTE = "externalFileAttribute";
const PROPERTY_NAME_MS_DOS_COMPATIBLE = "msDosCompatible";
const PROPERTY_NAME_ZIP64 = "zip64";

const PROPERTY_NAMES = [
	PROPERTY_NAME_FILENAME, PROPERTY_NAME_RAW_FILENAME, PROPERTY_NAME_COMPPRESSED_SIZE, PROPERTY_NAME_UNCOMPPRESSED_SIZE,
	PROPERTY_NAME_LAST_MODIFICATION_DATE, PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE, PROPERTY_NAME_COMMENT, PROPERTY_NAME_RAW_COMMENT,
	PROPERTY_NAME_LAST_ACCESS_DATE, PROPERTY_NAME_CREATION_DATE, PROPERTY_NAME_OFFSET, PROPERTY_NAME_DISK_NUMBER_START,
	PROPERTY_NAME_DISK_NUMBER_START, PROPERTY_NAME_INTERNAL_FILE_ATTRIBUTE, PROPERTY_NAME_EXTERNAL_FILE_ATTRIBUTE,
	PROPERTY_NAME_MS_DOS_COMPATIBLE, PROPERTY_NAME_ZIP64,
	"directory", "bitFlag", "encrypted", "signature", "filenameUTF8", "commentUTF8", "compressionMethod", "version", "versionMadeBy",
	"extraField", "rawExtraField", "extraFieldZip64", "extraFieldUnicodePath", "extraFieldUnicodeComment", "extraFieldAES", "extraFieldNTFS",
	"extraFieldExtendedTimestamp"];

class Entry {

	constructor(data) {
		PROPERTY_NAMES.forEach(name => this[name] = data[name]);
	}

}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


const ERR_BAD_FORMAT = "File format is not recognized";
const ERR_EOCDR_NOT_FOUND = "End of central directory not found";
const ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND = "End of Zip64 central directory locator not found";
const ERR_CENTRAL_DIRECTORY_NOT_FOUND = "Central directory header not found";
const ERR_LOCAL_FILE_HEADER_NOT_FOUND = "Local file header not found";
const ERR_EXTRAFIELD_ZIP64_NOT_FOUND = "Zip64 extra field not found";
const ERR_ENCRYPTED = "File contains encrypted entry";
const ERR_UNSUPPORTED_ENCRYPTION = "Encryption method not supported";
const ERR_UNSUPPORTED_COMPRESSION = "Compression method not supported";
const ERR_SPLIT_ZIP_FILE = "Split zip file";
const CHARSET_UTF8 = "utf-8";
const CHARSET_CP437 = "cp437";
const ZIP64_PROPERTIES = [
	[PROPERTY_NAME_UNCOMPPRESSED_SIZE, MAX_32_BITS],
	[PROPERTY_NAME_COMPPRESSED_SIZE, MAX_32_BITS],
	[PROPERTY_NAME_OFFSET, MAX_32_BITS],
	[PROPERTY_NAME_DISK_NUMBER_START, MAX_16_BITS]
];
const ZIP64_EXTRACTION = {
	[MAX_16_BITS]: {
		getValue: getUint32,
		bytes: 4
	},
	[MAX_32_BITS]: {
		getValue: getBigUint64,
		bytes: 8
	}
};

class ZipReader {

	constructor(reader, options = {}) {
		Object.assign(this, {
			reader: initReader(reader),
			options,
			config: getConfiguration()
		});
	}

	async* getEntriesGenerator(options = {}) {
		const zipReader = this;
		let { reader } = zipReader;
		const { config } = zipReader;
		await initStream(reader);
		if (reader.size === UNDEFINED_VALUE || !reader.readUint8Array) {
			reader = new BlobReader(await new Response(reader.readable).blob());
			await initStream(reader);
		}
		if (reader.size < END_OF_CENTRAL_DIR_LENGTH) {
			throw new Error(ERR_BAD_FORMAT);
		}
		reader.chunkSize = getChunkSize(config);
		const endOfDirectoryInfo = await seekSignature(reader, END_OF_CENTRAL_DIR_SIGNATURE, reader.size, END_OF_CENTRAL_DIR_LENGTH, MAX_16_BITS * 16);
		if (!endOfDirectoryInfo) {
			const signatureArray = await readUint8Array(reader, 0, 4);
			const signatureView = getDataView$1(signatureArray);
			if (getUint32(signatureView) == SPLIT_ZIP_FILE_SIGNATURE) {
				throw new Error(ERR_SPLIT_ZIP_FILE);
			} else {
				throw new Error(ERR_EOCDR_NOT_FOUND);
			}
		}
		const endOfDirectoryView = getDataView$1(endOfDirectoryInfo);
		let directoryDataLength = getUint32(endOfDirectoryView, 12);
		let directoryDataOffset = getUint32(endOfDirectoryView, 16);
		const commentOffset = endOfDirectoryInfo.offset;
		const commentLength = getUint16(endOfDirectoryView, 20);
		const appendedDataOffset = commentOffset + END_OF_CENTRAL_DIR_LENGTH + commentLength;
		let lastDiskNumber = getUint16(endOfDirectoryView, 4);
		const expectedLastDiskNumber = reader.lastDiskNumber || 0;
		let diskNumber = getUint16(endOfDirectoryView, 6);
		let filesLength = getUint16(endOfDirectoryView, 8);
		let prependedDataLength = 0;
		let startOffset = 0;
		if (directoryDataOffset == MAX_32_BITS || directoryDataLength == MAX_32_BITS || filesLength == MAX_16_BITS || diskNumber == MAX_16_BITS) {
			const endOfDirectoryLocatorArray = await readUint8Array(reader, endOfDirectoryInfo.offset - ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH, ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH);
			const endOfDirectoryLocatorView = getDataView$1(endOfDirectoryLocatorArray);
			if (getUint32(endOfDirectoryLocatorView, 0) == ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIGNATURE) {
				directoryDataOffset = getBigUint64(endOfDirectoryLocatorView, 8);
				let endOfDirectoryArray = await readUint8Array(reader, directoryDataOffset, ZIP64_END_OF_CENTRAL_DIR_LENGTH, -1);
				let endOfDirectoryView = getDataView$1(endOfDirectoryArray);
				const expectedDirectoryDataOffset = endOfDirectoryInfo.offset - ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH - ZIP64_END_OF_CENTRAL_DIR_LENGTH;
				if (getUint32(endOfDirectoryView, 0) != ZIP64_END_OF_CENTRAL_DIR_SIGNATURE && directoryDataOffset != expectedDirectoryDataOffset) {
					const originalDirectoryDataOffset = directoryDataOffset;
					directoryDataOffset = expectedDirectoryDataOffset;
					prependedDataLength = directoryDataOffset - originalDirectoryDataOffset;
					endOfDirectoryArray = await readUint8Array(reader, directoryDataOffset, ZIP64_END_OF_CENTRAL_DIR_LENGTH, -1);
					endOfDirectoryView = getDataView$1(endOfDirectoryArray);
				}
				if (getUint32(endOfDirectoryView, 0) != ZIP64_END_OF_CENTRAL_DIR_SIGNATURE) {
					throw new Error(ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND);
				}
				if (lastDiskNumber == MAX_16_BITS) {
					lastDiskNumber = getUint32(endOfDirectoryView, 16);
				}
				if (diskNumber == MAX_16_BITS) {
					diskNumber = getUint32(endOfDirectoryView, 20);
				}
				if (filesLength == MAX_16_BITS) {
					filesLength = getBigUint64(endOfDirectoryView, 32);
				}
				if (directoryDataLength == MAX_32_BITS) {
					directoryDataLength = getBigUint64(endOfDirectoryView, 40);
				}
				directoryDataOffset -= directoryDataLength;
			}
		}
		if (directoryDataOffset >= reader.size) {
			prependedDataLength = reader.size - directoryDataOffset - directoryDataLength - END_OF_CENTRAL_DIR_LENGTH;
			directoryDataOffset = reader.size - directoryDataLength - END_OF_CENTRAL_DIR_LENGTH;
		}
		if (expectedLastDiskNumber != lastDiskNumber) {
			throw new Error(ERR_SPLIT_ZIP_FILE);
		}
		if (directoryDataOffset < 0) {
			throw new Error(ERR_BAD_FORMAT);
		}
		let offset = 0;
		let directoryArray = await readUint8Array(reader, directoryDataOffset, directoryDataLength, diskNumber);
		let directoryView = getDataView$1(directoryArray);
		if (directoryDataLength) {
			const expectedDirectoryDataOffset = endOfDirectoryInfo.offset - directoryDataLength;
			if (getUint32(directoryView, offset) != CENTRAL_FILE_HEADER_SIGNATURE && directoryDataOffset != expectedDirectoryDataOffset) {
				const originalDirectoryDataOffset = directoryDataOffset;
				directoryDataOffset = expectedDirectoryDataOffset;
				prependedDataLength += directoryDataOffset - originalDirectoryDataOffset;
				directoryArray = await readUint8Array(reader, directoryDataOffset, directoryDataLength, diskNumber);
				directoryView = getDataView$1(directoryArray);
			}
		}
		const expectedDirectoryDataLength = endOfDirectoryInfo.offset - directoryDataOffset - (reader.lastDiskOffset || 0);
		if (directoryDataLength != expectedDirectoryDataLength && expectedDirectoryDataLength >= 0) {
			directoryDataLength = expectedDirectoryDataLength;
			directoryArray = await readUint8Array(reader, directoryDataOffset, directoryDataLength, diskNumber);
			directoryView = getDataView$1(directoryArray);
		}
		if (directoryDataOffset < 0 || directoryDataOffset >= reader.size) {
			throw new Error(ERR_BAD_FORMAT);
		}
		const filenameEncoding = getOptionValue$1(zipReader, options, "filenameEncoding");
		const commentEncoding = getOptionValue$1(zipReader, options, "commentEncoding");
		for (let indexFile = 0; indexFile < filesLength; indexFile++) {
			const fileEntry = new ZipEntry(reader, config, zipReader.options);
			if (getUint32(directoryView, offset) != CENTRAL_FILE_HEADER_SIGNATURE) {
				throw new Error(ERR_CENTRAL_DIRECTORY_NOT_FOUND);
			}
			readCommonHeader(fileEntry, directoryView, offset + 6);
			const languageEncodingFlag = Boolean(fileEntry.bitFlag.languageEncodingFlag);
			const filenameOffset = offset + 46;
			const extraFieldOffset = filenameOffset + fileEntry.filenameLength;
			const commentOffset = extraFieldOffset + fileEntry.extraFieldLength;
			const versionMadeBy = getUint16(directoryView, offset + 4);
			const msDosCompatible = (versionMadeBy & 0) == 0;
			const rawFilename = directoryArray.subarray(filenameOffset, extraFieldOffset);
			const commentLength = getUint16(directoryView, offset + 32);
			const endOffset = commentOffset + commentLength;
			const rawComment = directoryArray.subarray(commentOffset, endOffset);
			const filenameUTF8 = languageEncodingFlag;
			const commentUTF8 = languageEncodingFlag;
			const directory = msDosCompatible && ((getUint8(directoryView, offset + 38) & FILE_ATTR_MSDOS_DIR_MASK) == FILE_ATTR_MSDOS_DIR_MASK);
			const offsetFileEntry = getUint32(directoryView, offset + 42) + prependedDataLength;
			Object.assign(fileEntry, {
				versionMadeBy,
				msDosCompatible,
				compressedSize: 0,
				uncompressedSize: 0,
				commentLength,
				directory,
				offset: offsetFileEntry,
				diskNumberStart: getUint16(directoryView, offset + 34),
				internalFileAttribute: getUint16(directoryView, offset + 36),
				externalFileAttribute: getUint32(directoryView, offset + 38),
				rawFilename,
				filenameUTF8,
				commentUTF8,
				rawExtraField: directoryArray.subarray(extraFieldOffset, commentOffset)
			});
			const decode = getOptionValue$1(zipReader, options, "decodeText") || decodeText;
			const rawFilenameEncoding = filenameUTF8 ? CHARSET_UTF8 : filenameEncoding || CHARSET_CP437;
			const rawCommentEncoding = commentUTF8 ? CHARSET_UTF8 : commentEncoding || CHARSET_CP437;
			let filename = decode(rawFilename, rawFilenameEncoding);
			if (filename === UNDEFINED_VALUE) {
				filename = decodeText(rawFilename, rawFilenameEncoding);
			}
			let comment = decode(rawComment, rawCommentEncoding);
			if (comment === UNDEFINED_VALUE) {
				comment = decodeText(rawComment, rawCommentEncoding);
			}
			Object.assign(fileEntry, {
				rawComment,
				filename,
				comment,
				directory: directory || filename.endsWith(DIRECTORY_SIGNATURE)
			});
			startOffset = Math.max(offsetFileEntry, startOffset);
			await readCommonFooter(fileEntry, fileEntry, directoryView, offset + 6);
			const entry = new Entry(fileEntry);
			entry.getData = (writer, options) => fileEntry.getData(writer, entry, options);
			offset = endOffset;
			const { onprogress } = options;
			if (onprogress) {
				try {
					await onprogress(indexFile + 1, filesLength, new Entry(fileEntry));
				} catch (_error) {
					// ignored
				}
			}
			yield entry;
		}
		const extractPrependedData = getOptionValue$1(zipReader, options, "extractPrependedData");
		const extractAppendedData = getOptionValue$1(zipReader, options, "extractAppendedData");
		if (extractPrependedData) {
			zipReader.prependedData = startOffset > 0 ? await readUint8Array(reader, 0, startOffset) : new Uint8Array();
		}
		zipReader.comment = commentLength ? await readUint8Array(reader, commentOffset + END_OF_CENTRAL_DIR_LENGTH, commentLength) : new Uint8Array();
		if (extractAppendedData) {
			zipReader.appendedData = appendedDataOffset < reader.size ? await readUint8Array(reader, appendedDataOffset, reader.size - appendedDataOffset) : new Uint8Array();
		}
		return true;
	}

	async getEntries(options = {}) {
		const entries = [];
		for await (const entry of this.getEntriesGenerator(options)) {
			entries.push(entry);
		}
		return entries;
	}

	async close() {
	}
}

class ZipReaderStream {

	constructor(options = {}) {
		const { readable, writable } = new TransformStream();
		const gen = new ZipReader(readable, options).getEntriesGenerator();
		this.readable = new ReadableStream({
			async pull(controller) {
				const { done, value } = await gen.next();
				if (done)
					return controller.close();
				const chunk = {
					...value,
					readable: (function () {
						const { readable, writable } = new TransformStream();
						if (value.getData) {
							value.getData(writable);
							return readable;
						}
					})()
				};
				delete chunk.getData;
				controller.enqueue(chunk);
			}
		});
		this.writable = writable;
	}
}

class ZipEntry {

	constructor(reader, config, options) {
		Object.assign(this, {
			reader,
			config,
			options
		});
	}

	async getData(writer, fileEntry, options = {}) {
		const zipEntry = this;
		const {
			reader,
			offset,
			diskNumberStart,
			extraFieldAES,
			compressionMethod,
			config,
			bitFlag,
			signature,
			rawLastModDate,
			uncompressedSize,
			compressedSize
		} = zipEntry;
		const localDirectory = fileEntry.localDirectory = {};
		const dataArray = await readUint8Array(reader, offset, 30, diskNumberStart);
		const dataView = getDataView$1(dataArray);
		let password = getOptionValue$1(zipEntry, options, "password");
		let rawPassword = getOptionValue$1(zipEntry, options, "rawPassword");
		password = password && password.length && password;
		rawPassword = rawPassword && rawPassword.length && rawPassword;
		if (extraFieldAES) {
			if (extraFieldAES.originalCompressionMethod != COMPRESSION_METHOD_AES) {
				throw new Error(ERR_UNSUPPORTED_COMPRESSION);
			}
		}
		if (compressionMethod != COMPRESSION_METHOD_STORE && compressionMethod != COMPRESSION_METHOD_DEFLATE) {
			throw new Error(ERR_UNSUPPORTED_COMPRESSION);
		}
		if (getUint32(dataView, 0) != LOCAL_FILE_HEADER_SIGNATURE) {
			throw new Error(ERR_LOCAL_FILE_HEADER_NOT_FOUND);
		}
		readCommonHeader(localDirectory, dataView, 4);
		localDirectory.rawExtraField = localDirectory.extraFieldLength ?
			await readUint8Array(reader, offset + 30 + localDirectory.filenameLength, localDirectory.extraFieldLength, diskNumberStart) :
			new Uint8Array();
		await readCommonFooter(zipEntry, localDirectory, dataView, 4, true);
		Object.assign(fileEntry, {
			lastAccessDate: localDirectory.lastAccessDate,
			creationDate: localDirectory.creationDate
		});
		const encrypted = zipEntry.encrypted && localDirectory.encrypted;
		const zipCrypto = encrypted && !extraFieldAES;
		if (encrypted) {
			if (!zipCrypto && extraFieldAES.strength === UNDEFINED_VALUE) {
				throw new Error(ERR_UNSUPPORTED_ENCRYPTION);
			} else if (!password && !rawPassword) {
				throw new Error(ERR_ENCRYPTED);
			}
		}
		const dataOffset = offset + 30 + localDirectory.filenameLength + localDirectory.extraFieldLength;
		const size = compressedSize;
		const readable = reader.readable;
		Object.assign(readable, {
			diskNumberStart,
			offset: dataOffset,
			size
		});
		const signal = getOptionValue$1(zipEntry, options, "signal");
		const checkPasswordOnly = getOptionValue$1(zipEntry, options, "checkPasswordOnly");
		if (checkPasswordOnly) {
			writer = new WritableStream();
		}
		writer = initWriter(writer);
		await initStream(writer, uncompressedSize);
		const { writable } = writer;
		const { onstart, onprogress, onend } = options;
		const workerOptions = {
			options: {
				codecType: CODEC_INFLATE,
				password,
				rawPassword,
				zipCrypto,
				encryptionStrength: extraFieldAES && extraFieldAES.strength,
				signed: getOptionValue$1(zipEntry, options, "checkSignature"),
				passwordVerification: zipCrypto && (bitFlag.dataDescriptor ? ((rawLastModDate >>> 8) & 0xFF) : ((signature >>> 24) & 0xFF)),
				signature,
				compressed: compressionMethod != 0,
				encrypted,
				useWebWorkers: getOptionValue$1(zipEntry, options, "useWebWorkers"),
				useCompressionStream: getOptionValue$1(zipEntry, options, "useCompressionStream"),
				transferStreams: getOptionValue$1(zipEntry, options, "transferStreams"),
				checkPasswordOnly
			},
			config,
			streamOptions: { signal, size, onstart, onprogress, onend }
		};
		let outputSize = 0;
		try {
			({ outputSize } = (await runWorker({ readable, writable }, workerOptions)));
		} catch (error) {
			if (!checkPasswordOnly || error.message != ERR_ABORT_CHECK_PASSWORD) {
				throw error;
			}
		} finally {
			const preventClose = getOptionValue$1(zipEntry, options, "preventClose");
			writable.size += outputSize;
			if (!preventClose && !writable.locked) {
				await writable.getWriter().close();
			}
		}
		return checkPasswordOnly ? UNDEFINED_VALUE : writer.getData ? writer.getData() : writable;
	}
}

function readCommonHeader(directory, dataView, offset) {
	const rawBitFlag = directory.rawBitFlag = getUint16(dataView, offset + 2);
	const encrypted = (rawBitFlag & BITFLAG_ENCRYPTED) == BITFLAG_ENCRYPTED;
	const rawLastModDate = getUint32(dataView, offset + 6);
	Object.assign(directory, {
		encrypted,
		version: getUint16(dataView, offset),
		bitFlag: {
			level: (rawBitFlag & BITFLAG_LEVEL) >> 1,
			dataDescriptor: (rawBitFlag & BITFLAG_DATA_DESCRIPTOR) == BITFLAG_DATA_DESCRIPTOR,
			languageEncodingFlag: (rawBitFlag & BITFLAG_LANG_ENCODING_FLAG) == BITFLAG_LANG_ENCODING_FLAG
		},
		rawLastModDate,
		lastModDate: getDate(rawLastModDate),
		filenameLength: getUint16(dataView, offset + 22),
		extraFieldLength: getUint16(dataView, offset + 24)
	});
}

async function readCommonFooter(fileEntry, directory, dataView, offset, localDirectory) {
	const { rawExtraField } = directory;
	const extraField = directory.extraField = new Map();
	const rawExtraFieldView = getDataView$1(new Uint8Array(rawExtraField));
	let offsetExtraField = 0;
	try {
		while (offsetExtraField < rawExtraField.length) {
			const type = getUint16(rawExtraFieldView, offsetExtraField);
			const size = getUint16(rawExtraFieldView, offsetExtraField + 2);
			extraField.set(type, {
				type,
				data: rawExtraField.slice(offsetExtraField + 4, offsetExtraField + 4 + size)
			});
			offsetExtraField += 4 + size;
		}
	} catch (_error) {
		// ignored
	}
	const compressionMethod = getUint16(dataView, offset + 4);
	Object.assign(directory, {
		signature: getUint32(dataView, offset + 10),
		uncompressedSize: getUint32(dataView, offset + 18),
		compressedSize: getUint32(dataView, offset + 14)
	});
	const extraFieldZip64 = extraField.get(EXTRAFIELD_TYPE_ZIP64);
	if (extraFieldZip64) {
		readExtraFieldZip64(extraFieldZip64, directory);
		directory.extraFieldZip64 = extraFieldZip64;
	}
	const extraFieldUnicodePath = extraField.get(EXTRAFIELD_TYPE_UNICODE_PATH);
	if (extraFieldUnicodePath) {
		await readExtraFieldUnicode(extraFieldUnicodePath, PROPERTY_NAME_FILENAME, PROPERTY_NAME_RAW_FILENAME, directory, fileEntry);
		directory.extraFieldUnicodePath = extraFieldUnicodePath;
	}
	const extraFieldUnicodeComment = extraField.get(EXTRAFIELD_TYPE_UNICODE_COMMENT);
	if (extraFieldUnicodeComment) {
		await readExtraFieldUnicode(extraFieldUnicodeComment, PROPERTY_NAME_COMMENT, PROPERTY_NAME_RAW_COMMENT, directory, fileEntry);
		directory.extraFieldUnicodeComment = extraFieldUnicodeComment;
	}
	const extraFieldAES = extraField.get(EXTRAFIELD_TYPE_AES);
	if (extraFieldAES) {
		readExtraFieldAES(extraFieldAES, directory, compressionMethod);
		directory.extraFieldAES = extraFieldAES;
	} else {
		directory.compressionMethod = compressionMethod;
	}
	const extraFieldNTFS = extraField.get(EXTRAFIELD_TYPE_NTFS);
	if (extraFieldNTFS) {
		readExtraFieldNTFS(extraFieldNTFS, directory);
		directory.extraFieldNTFS = extraFieldNTFS;
	}
	const extraFieldExtendedTimestamp = extraField.get(EXTRAFIELD_TYPE_EXTENDED_TIMESTAMP);
	if (extraFieldExtendedTimestamp) {
		readExtraFieldExtendedTimestamp(extraFieldExtendedTimestamp, directory, localDirectory);
		directory.extraFieldExtendedTimestamp = extraFieldExtendedTimestamp;
	}
	const extraFieldUSDZ = extraField.get(EXTRAFIELD_TYPE_USDZ);
	if (extraFieldUSDZ) {
		directory.extraFieldUSDZ = extraFieldUSDZ;
	}
}

function readExtraFieldZip64(extraFieldZip64, directory) {
	directory.zip64 = true;
	const extraFieldView = getDataView$1(extraFieldZip64.data);
	const missingProperties = ZIP64_PROPERTIES.filter(([propertyName, max]) => directory[propertyName] == max);
	for (let indexMissingProperty = 0, offset = 0; indexMissingProperty < missingProperties.length; indexMissingProperty++) {
		const [propertyName, max] = missingProperties[indexMissingProperty];
		if (directory[propertyName] == max) {
			const extraction = ZIP64_EXTRACTION[max];
			directory[propertyName] = extraFieldZip64[propertyName] = extraction.getValue(extraFieldView, offset);
			offset += extraction.bytes;
		} else if (extraFieldZip64[propertyName]) {
			throw new Error(ERR_EXTRAFIELD_ZIP64_NOT_FOUND);
		}
	}
}

async function readExtraFieldUnicode(extraFieldUnicode, propertyName, rawPropertyName, directory, fileEntry) {
	const extraFieldView = getDataView$1(extraFieldUnicode.data);
	const crc32 = new Crc32();
	crc32.append(fileEntry[rawPropertyName]);
	const dataViewSignature = getDataView$1(new Uint8Array(4));
	dataViewSignature.setUint32(0, crc32.get(), true);
	const signature = getUint32(extraFieldView, 1);
	Object.assign(extraFieldUnicode, {
		version: getUint8(extraFieldView, 0),
		[propertyName]: decodeText(extraFieldUnicode.data.subarray(5)),
		valid: !fileEntry.bitFlag.languageEncodingFlag && signature == getUint32(dataViewSignature, 0)
	});
	if (extraFieldUnicode.valid) {
		directory[propertyName] = extraFieldUnicode[propertyName];
		directory[propertyName + "UTF8"] = true;
	}
}

function readExtraFieldAES(extraFieldAES, directory, compressionMethod) {
	const extraFieldView = getDataView$1(extraFieldAES.data);
	const strength = getUint8(extraFieldView, 4);
	Object.assign(extraFieldAES, {
		vendorVersion: getUint8(extraFieldView, 0),
		vendorId: getUint8(extraFieldView, 2),
		strength,
		originalCompressionMethod: compressionMethod,
		compressionMethod: getUint16(extraFieldView, 5)
	});
	directory.compressionMethod = extraFieldAES.compressionMethod;
}

function readExtraFieldNTFS(extraFieldNTFS, directory) {
	const extraFieldView = getDataView$1(extraFieldNTFS.data);
	let offsetExtraField = 4;
	let tag1Data;
	try {
		while (offsetExtraField < extraFieldNTFS.data.length && !tag1Data) {
			const tagValue = getUint16(extraFieldView, offsetExtraField);
			const attributeSize = getUint16(extraFieldView, offsetExtraField + 2);
			if (tagValue == EXTRAFIELD_TYPE_NTFS_TAG1) {
				tag1Data = extraFieldNTFS.data.slice(offsetExtraField + 4, offsetExtraField + 4 + attributeSize);
			}
			offsetExtraField += 4 + attributeSize;
		}
	} catch (_error) {
		// ignored
	}
	try {
		if (tag1Data && tag1Data.length == 24) {
			const tag1View = getDataView$1(tag1Data);
			const rawLastModDate = tag1View.getBigUint64(0, true);
			const rawLastAccessDate = tag1View.getBigUint64(8, true);
			const rawCreationDate = tag1View.getBigUint64(16, true);
			Object.assign(extraFieldNTFS, {
				rawLastModDate,
				rawLastAccessDate,
				rawCreationDate
			});
			const lastModDate = getDateNTFS(rawLastModDate);
			const lastAccessDate = getDateNTFS(rawLastAccessDate);
			const creationDate = getDateNTFS(rawCreationDate);
			const extraFieldData = { lastModDate, lastAccessDate, creationDate };
			Object.assign(extraFieldNTFS, extraFieldData);
			Object.assign(directory, extraFieldData);
		}
	} catch (_error) {
		// ignored
	}
}

function readExtraFieldExtendedTimestamp(extraFieldExtendedTimestamp, directory, localDirectory) {
	const extraFieldView = getDataView$1(extraFieldExtendedTimestamp.data);
	const flags = getUint8(extraFieldView, 0);
	const timeProperties = [];
	const timeRawProperties = [];
	if (localDirectory) {
		if ((flags & 0x1) == 0x1) {
			timeProperties.push(PROPERTY_NAME_LAST_MODIFICATION_DATE);
			timeRawProperties.push(PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE);
		}
		if ((flags & 0x2) == 0x2) {
			timeProperties.push(PROPERTY_NAME_LAST_ACCESS_DATE);
			timeRawProperties.push(PROPERTY_NAME_RAW_LAST_ACCESS_DATE);
		}
		if ((flags & 0x4) == 0x4) {
			timeProperties.push(PROPERTY_NAME_CREATION_DATE);
			timeRawProperties.push(PROPERTY_NAME_RAW_CREATION_DATE);
		}
	} else if (extraFieldExtendedTimestamp.data.length >= 5) {
		timeProperties.push(PROPERTY_NAME_LAST_MODIFICATION_DATE);
		timeRawProperties.push(PROPERTY_NAME_RAW_LAST_MODIFICATION_DATE);
	}
	let offset = 1;
	timeProperties.forEach((propertyName, indexProperty) => {
		if (extraFieldExtendedTimestamp.data.length >= offset + 4) {
			const time = getUint32(extraFieldView, offset);
			directory[propertyName] = extraFieldExtendedTimestamp[propertyName] = new Date(time * 1000);
			const rawPropertyName = timeRawProperties[indexProperty];
			extraFieldExtendedTimestamp[rawPropertyName] = time;
		}
		offset += 4;
	});
}

async function seekSignature(reader, signature, startOffset, minimumBytes, maximumLength) {
	const signatureArray = new Uint8Array(4);
	const signatureView = getDataView$1(signatureArray);
	setUint32$1(signatureView, 0, signature);
	const maximumBytes = minimumBytes + maximumLength;
	return (await seek(minimumBytes)) || await seek(Math.min(maximumBytes, startOffset));

	async function seek(length) {
		const offset = startOffset - length;
		const bytes = await readUint8Array(reader, offset, length);
		for (let indexByte = bytes.length - minimumBytes; indexByte >= 0; indexByte--) {
			if (bytes[indexByte] == signatureArray[0] && bytes[indexByte + 1] == signatureArray[1] &&
				bytes[indexByte + 2] == signatureArray[2] && bytes[indexByte + 3] == signatureArray[3]) {
				return {
					offset: offset + indexByte,
					buffer: bytes.slice(indexByte, indexByte + minimumBytes).buffer
				};
			}
		}
	}
}

function getOptionValue$1(zipReader, options, name) {
	return options[name] === UNDEFINED_VALUE ? zipReader.options[name] : options[name];
}

function getDate(timeRaw) {
	const date = (timeRaw & 0xffff0000) >> 16, time = timeRaw & 0x0000ffff;
	try {
		return new Date(1980 + ((date & 0xFE00) >> 9), ((date & 0x01E0) >> 5) - 1, date & 0x001F, (time & 0xF800) >> 11, (time & 0x07E0) >> 5, (time & 0x001F) * 2, 0);
	} catch (_error) {
		// ignored
	}
}

function getDateNTFS(timeRaw) {
	return new Date((Number((timeRaw / BigInt(10000)) - BigInt(11644473600000))));
}

function getUint8(view, offset) {
	return view.getUint8(offset);
}

function getUint16(view, offset) {
	return view.getUint16(offset, true);
}

function getUint32(view, offset) {
	return view.getUint32(offset, true);
}

function getBigUint64(view, offset) {
	return Number(view.getBigUint64(offset, true));
}

function setUint32$1(view, offset, value) {
	view.setUint32(offset, value, true);
}

function getDataView$1(array) {
	return new DataView(array.buffer);
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


const ERR_DUPLICATED_NAME = "File already exists";
const ERR_INVALID_COMMENT = "Zip file comment exceeds 64KB";
const ERR_INVALID_ENTRY_COMMENT = "File entry comment exceeds 64KB";
const ERR_INVALID_ENTRY_NAME = "File entry name exceeds 64KB";
const ERR_INVALID_VERSION = "Version exceeds 65535";
const ERR_INVALID_ENCRYPTION_STRENGTH = "The strength must equal 1, 2, or 3";
const ERR_INVALID_EXTRAFIELD_TYPE = "Extra field type exceeds 65535";
const ERR_INVALID_EXTRAFIELD_DATA = "Extra field data exceeds 64KB";
const ERR_UNSUPPORTED_FORMAT = "Zip64 is not supported (make sure 'keepOrder' is set to 'true')";

const EXTRAFIELD_DATA_AES = new Uint8Array([0x07, 0x00, 0x02, 0x00, 0x41, 0x45, 0x03, 0x00, 0x00]);

let workers = 0;
const pendingEntries = [];

class ZipWriter {

	constructor(writer, options = {}) {
		writer = initWriter(writer);
		const addSplitZipSignature =
			writer.availableSize !== UNDEFINED_VALUE && writer.availableSize > 0 && writer.availableSize !== Infinity &&
			writer.maxSize !== UNDEFINED_VALUE && writer.maxSize > 0 && writer.maxSize !== Infinity;
		Object.assign(this, {
			writer,
			addSplitZipSignature,
			options,
			config: getConfiguration(),
			files: new Map(),
			filenames: new Set(),
			offset: writer.writable.size,
			pendingEntriesSize: 0,
			pendingAddFileCalls: new Set(),
			bufferedWrites: 0
		});
	}

	async add(name = "", reader, options = {}) {
		const zipWriter = this;
		const {
			pendingAddFileCalls,
			config
		} = zipWriter;
		if (workers < config.maxWorkers) {
			workers++;
		} else {
			await new Promise(resolve => pendingEntries.push(resolve));
		}
		let promiseAddFile;
		try {
			name = name.trim();
			if (zipWriter.filenames.has(name)) {
				throw new Error(ERR_DUPLICATED_NAME);
			}
			zipWriter.filenames.add(name);
			promiseAddFile = addFile(zipWriter, name, reader, options);
			pendingAddFileCalls.add(promiseAddFile);
			return await promiseAddFile;
		} catch (error) {
			zipWriter.filenames.delete(name);
			throw error;
		} finally {
			pendingAddFileCalls.delete(promiseAddFile);
			const pendingEntry = pendingEntries.shift();
			if (pendingEntry) {
				pendingEntry();
			} else {
				workers--;
			}
		}
	}

	async close(comment = new Uint8Array(), options = {}) {
		const zipWriter = this;
		const { pendingAddFileCalls, writer } = this;
		const { writable } = writer;
		while (pendingAddFileCalls.size) {
			await Promise.allSettled(Array.from(pendingAddFileCalls));
		}
		await closeFile(this, comment, options);
		const preventClose = getOptionValue(zipWriter, options, "preventClose");
		if (!preventClose) {
			await writable.getWriter().close();
		}
		return writer.getData ? writer.getData() : writable;
	}
}

class ZipWriterStream {

	constructor(options = {}) {
		const { readable, writable } = new TransformStream();
		this.readable = readable;
		this.zipWriter = new ZipWriter(writable, options);
	}

	transform(path) {
		const { readable, writable } = new TransformStream({
			flush: () => { this.zipWriter.close(); }
		});
		this.zipWriter.add(path, readable);
		return { readable: this.readable, writable };
	}

	writable(path) {
		const { readable, writable } = new TransformStream();
		this.zipWriter.add(path, readable);
		return writable;
	}

	close(comment = undefined, options = {}) {
		return this.zipWriter.close(comment, options);
	}
}

async function addFile(zipWriter, name, reader, options) {
	name = name.trim();
	if (options.directory && (!name.endsWith(DIRECTORY_SIGNATURE))) {
		name += DIRECTORY_SIGNATURE;
	} else {
		options.directory = name.endsWith(DIRECTORY_SIGNATURE);
	}
	const encode = getOptionValue(zipWriter, options, "encodeText", encodeText);
	let rawFilename = encode(name);
	if (rawFilename === UNDEFINED_VALUE) {
		rawFilename = encodeText(name);
	}
	if (getLength(rawFilename) > MAX_16_BITS) {
		throw new Error(ERR_INVALID_ENTRY_NAME);
	}
	const comment = options.comment || "";
	let rawComment = encode(comment);
	if (rawComment === UNDEFINED_VALUE) {
		rawComment = encodeText(comment);
	}
	if (getLength(rawComment) > MAX_16_BITS) {
		throw new Error(ERR_INVALID_ENTRY_COMMENT);
	}
	const version = getOptionValue(zipWriter, options, "version", VERSION_DEFLATE);
	if (version > MAX_16_BITS) {
		throw new Error(ERR_INVALID_VERSION);
	}
	const versionMadeBy = getOptionValue(zipWriter, options, "versionMadeBy", 20);
	if (versionMadeBy > MAX_16_BITS) {
		throw new Error(ERR_INVALID_VERSION);
	}
	const lastModDate = getOptionValue(zipWriter, options, PROPERTY_NAME_LAST_MODIFICATION_DATE, new Date());
	const lastAccessDate = getOptionValue(zipWriter, options, PROPERTY_NAME_LAST_ACCESS_DATE);
	const creationDate = getOptionValue(zipWriter, options, PROPERTY_NAME_CREATION_DATE);
	const msDosCompatible = getOptionValue(zipWriter, options, PROPERTY_NAME_MS_DOS_COMPATIBLE, true);
	const internalFileAttribute = getOptionValue(zipWriter, options, PROPERTY_NAME_INTERNAL_FILE_ATTRIBUTE, 0);
	const externalFileAttribute = getOptionValue(zipWriter, options, PROPERTY_NAME_EXTERNAL_FILE_ATTRIBUTE, 0);
	const password = getOptionValue(zipWriter, options, "password");
	const rawPassword = getOptionValue(zipWriter, options, "rawPassword");
	const encryptionStrength = getOptionValue(zipWriter, options, "encryptionStrength", 3);
	const zipCrypto = getOptionValue(zipWriter, options, "zipCrypto");
	const extendedTimestamp = getOptionValue(zipWriter, options, "extendedTimestamp", true);
	const keepOrder = getOptionValue(zipWriter, options, "keepOrder", true);
	const level = getOptionValue(zipWriter, options, "level");
	const useWebWorkers = getOptionValue(zipWriter, options, "useWebWorkers");
	const bufferedWrite = getOptionValue(zipWriter, options, "bufferedWrite");
	const dataDescriptorSignature = getOptionValue(zipWriter, options, "dataDescriptorSignature", false);
	const signal = getOptionValue(zipWriter, options, "signal");
	const useCompressionStream = getOptionValue(zipWriter, options, "useCompressionStream");
	let dataDescriptor = getOptionValue(zipWriter, options, "dataDescriptor", true);
	let zip64 = getOptionValue(zipWriter, options, PROPERTY_NAME_ZIP64);
	if (password !== UNDEFINED_VALUE && encryptionStrength !== UNDEFINED_VALUE && (encryptionStrength < 1 || encryptionStrength > 3)) {
		throw new Error(ERR_INVALID_ENCRYPTION_STRENGTH);
	}
	let rawExtraField = new Uint8Array();
	const { extraField } = options;
	if (extraField) {
		let extraFieldSize = 0;
		let offset = 0;
		extraField.forEach(data => extraFieldSize += 4 + getLength(data));
		rawExtraField = new Uint8Array(extraFieldSize);
		extraField.forEach((data, type) => {
			if (type > MAX_16_BITS) {
				throw new Error(ERR_INVALID_EXTRAFIELD_TYPE);
			}
			if (getLength(data) > MAX_16_BITS) {
				throw new Error(ERR_INVALID_EXTRAFIELD_DATA);
			}
			arraySet(rawExtraField, new Uint16Array([type]), offset);
			arraySet(rawExtraField, new Uint16Array([getLength(data)]), offset + 2);
			arraySet(rawExtraField, data, offset + 4);
			offset += 4 + getLength(data);
		});
	}
	let maximumCompressedSize = 0;
	let maximumEntrySize = 0;
	let uncompressedSize = 0;
	const zip64Enabled = zip64 === true;
	if (reader) {
		reader = initReader(reader);
		await initStream(reader);
		if (reader.size === UNDEFINED_VALUE) {
			dataDescriptor = true;
			if (zip64 || zip64 === UNDEFINED_VALUE) {
				zip64 = true;
				uncompressedSize = maximumCompressedSize = MAX_32_BITS + 1;
			}
		} else {
			uncompressedSize = reader.size;
			maximumCompressedSize = getMaximumCompressedSize(uncompressedSize);
		}
	}
	const { diskOffset, diskNumber, maxSize } = zipWriter.writer;
	const zip64UncompressedSize = zip64Enabled || uncompressedSize > MAX_32_BITS;
	const zip64CompressedSize = zip64Enabled || maximumCompressedSize > MAX_32_BITS;
	const zip64Offset = zip64Enabled || zipWriter.offset + zipWriter.pendingEntriesSize - diskOffset > MAX_32_BITS;
	const supportZip64SplitFile = getOptionValue(zipWriter, options, "supportZip64SplitFile", true);
	const zip64DiskNumberStart = (supportZip64SplitFile && zip64Enabled) || diskNumber + Math.ceil(zipWriter.pendingEntriesSize / maxSize) > MAX_16_BITS;
	if (zip64Offset || zip64UncompressedSize || zip64CompressedSize || zip64DiskNumberStart) {
		if (zip64 === false || !keepOrder) {
			throw new Error(ERR_UNSUPPORTED_FORMAT);
		} else {
			zip64 = true;
		}
	}
	zip64 = zip64 || false;
	options = Object.assign({}, options, {
		rawFilename,
		rawComment,
		version,
		versionMadeBy,
		lastModDate,
		lastAccessDate,
		creationDate,
		rawExtraField,
		zip64,
		zip64UncompressedSize,
		zip64CompressedSize,
		zip64Offset,
		zip64DiskNumberStart,
		password,
		rawPassword,
		level: !useCompressionStream && zipWriter.config.CompressionStream === UNDEFINED_VALUE ? 0 : level,
		useWebWorkers,
		encryptionStrength,
		extendedTimestamp,
		zipCrypto,
		bufferedWrite,
		keepOrder,
		dataDescriptor,
		dataDescriptorSignature,
		signal,
		msDosCompatible,
		internalFileAttribute,
		externalFileAttribute,
		useCompressionStream
	});
	const headerInfo = getHeaderInfo(options);
	const dataDescriptorInfo = getDataDescriptorInfo(options);
	const metadataSize = getLength(headerInfo.localHeaderArray, dataDescriptorInfo.dataDescriptorArray);
	maximumEntrySize = metadataSize + maximumCompressedSize;
	if (zipWriter.options.usdz) {
		maximumEntrySize += maximumEntrySize + 64;
	}
	zipWriter.pendingEntriesSize += maximumEntrySize;
	let fileEntry;
	try {
		fileEntry = await getFileEntry(zipWriter, name, reader, { headerInfo, dataDescriptorInfo, metadataSize }, options);
	} finally {
		zipWriter.pendingEntriesSize -= maximumEntrySize;
	}
	Object.assign(fileEntry, { name, comment, extraField });
	return new Entry(fileEntry);
}

async function getFileEntry(zipWriter, name, reader, entryInfo, options) {
	const {
		files,
		writer
	} = zipWriter;
	const {
		keepOrder,
		dataDescriptor,
		signal
	} = options;
	const {
		headerInfo
	} = entryInfo;
	const { usdz } = zipWriter.options;
	const previousFileEntry = Array.from(files.values()).pop();
	let fileEntry = {};
	let bufferedWrite;
	let releaseLockWriter;
	let releaseLockCurrentFileEntry;
	let writingBufferedEntryData;
	let writingEntryData;
	let fileWriter;
	let blobPromise;
	files.set(name, fileEntry);
	try {
		let lockPreviousFileEntry;
		if (keepOrder) {
			lockPreviousFileEntry = previousFileEntry && previousFileEntry.lock;
			requestLockCurrentFileEntry();
		}
		if ((options.bufferedWrite || zipWriter.writerLocked || (zipWriter.bufferedWrites && keepOrder) || !dataDescriptor) && !usdz) {
			fileWriter = new TransformStream();
			blobPromise = new Response(fileWriter.readable).blob();
			fileWriter.writable.size = 0;
			bufferedWrite = true;
			zipWriter.bufferedWrites++;
			await initStream(writer);
		} else {
			fileWriter = writer;
			await requestLockWriter();
		}
		await initStream(fileWriter);
		const { writable } = writer;
		let { diskOffset } = writer;
		if (zipWriter.addSplitZipSignature) {
			delete zipWriter.addSplitZipSignature;
			const signatureArray = new Uint8Array(4);
			const signatureArrayView = getDataView(signatureArray);
			setUint32(signatureArrayView, 0, SPLIT_ZIP_FILE_SIGNATURE);
			await writeData(writable, signatureArray);
			zipWriter.offset += 4;
		}
		if (usdz) {
			appendExtraFieldUSDZ(entryInfo, zipWriter.offset - diskOffset);
		}
		if (!bufferedWrite) {
			await lockPreviousFileEntry;
			await skipDiskIfNeeded(writable);
		}
		const { diskNumber } = writer;
		writingEntryData = true;
		fileEntry.diskNumberStart = diskNumber;
		fileEntry = await createFileEntry(reader, fileWriter, fileEntry, entryInfo, zipWriter.config, options);
		writingEntryData = false;
		files.set(name, fileEntry);
		fileEntry.filename = name;
		if (bufferedWrite) {
			await fileWriter.writable.getWriter().close();
			let blob = await blobPromise;
			await lockPreviousFileEntry;
			await requestLockWriter();
			writingBufferedEntryData = true;
			if (!dataDescriptor) {
				blob = await writeExtraHeaderInfo(fileEntry, blob, writable, options);
			}
			await skipDiskIfNeeded(writable);
			fileEntry.diskNumberStart = writer.diskNumber;
			diskOffset = writer.diskOffset;
			await blob.stream().pipeTo(writable, { preventClose: true, preventAbort: true, signal });
			writable.size += blob.size;
			writingBufferedEntryData = false;
		}
		fileEntry.offset = zipWriter.offset - diskOffset;
		if (fileEntry.zip64) {
			setZip64ExtraInfo(fileEntry, options);
		} else if (fileEntry.offset > MAX_32_BITS) {
			throw new Error(ERR_UNSUPPORTED_FORMAT);
		}
		zipWriter.offset += fileEntry.size;
		return fileEntry;
	} catch (error) {
		if ((bufferedWrite && writingBufferedEntryData) || (!bufferedWrite && writingEntryData)) {
			zipWriter.hasCorruptedEntries = true;
			if (error) {
				try {
					error.corruptedEntry = true;
				} catch (_error) {
					// ignored
				}
			}
			if (bufferedWrite) {
				zipWriter.offset += fileWriter.writable.size;
			} else {
				zipWriter.offset = fileWriter.writable.size;
			}
		}
		files.delete(name);
		throw error;
	} finally {
		if (bufferedWrite) {
			zipWriter.bufferedWrites--;
		}
		if (releaseLockCurrentFileEntry) {
			releaseLockCurrentFileEntry();
		}
		if (releaseLockWriter) {
			releaseLockWriter();
		}
	}

	function requestLockCurrentFileEntry() {
		fileEntry.lock = new Promise(resolve => releaseLockCurrentFileEntry = resolve);
	}

	async function requestLockWriter() {
		zipWriter.writerLocked = true;
		const { lockWriter } = zipWriter;
		zipWriter.lockWriter = new Promise(resolve => releaseLockWriter = () => {
			zipWriter.writerLocked = false;
			resolve();
		});
		await lockWriter;
	}

	async function skipDiskIfNeeded(writable) {
		if (getLength(headerInfo.localHeaderArray) > writer.availableSize) {
			writer.availableSize = 0;
			await writeData(writable, new Uint8Array());
		}
	}
}

async function createFileEntry(reader, writer, { diskNumberStart, lock }, entryInfo, config, options) {
	const {
		headerInfo,
		dataDescriptorInfo,
		metadataSize
	} = entryInfo;
	const {
		localHeaderArray,
		headerArray,
		lastModDate,
		rawLastModDate,
		encrypted,
		compressed,
		version,
		compressionMethod,
		rawExtraFieldExtendedTimestamp,
		extraFieldExtendedTimestampFlag,
		rawExtraFieldNTFS,
		rawExtraFieldAES
	} = headerInfo;
	const { dataDescriptorArray } = dataDescriptorInfo;
	const {
		rawFilename,
		lastAccessDate,
		creationDate,
		password,
		rawPassword,
		level,
		zip64,
		zip64UncompressedSize,
		zip64CompressedSize,
		zip64Offset,
		zip64DiskNumberStart,
		zipCrypto,
		dataDescriptor,
		directory,
		versionMadeBy,
		rawComment,
		rawExtraField,
		useWebWorkers,
		onstart,
		onprogress,
		onend,
		signal,
		encryptionStrength,
		extendedTimestamp,
		msDosCompatible,
		internalFileAttribute,
		externalFileAttribute,
		useCompressionStream
	} = options;
	const fileEntry = {
		lock,
		versionMadeBy,
		zip64,
		directory: Boolean(directory),
		filenameUTF8: true,
		rawFilename,
		commentUTF8: true,
		rawComment,
		rawExtraFieldExtendedTimestamp,
		rawExtraFieldNTFS,
		rawExtraFieldAES,
		rawExtraField,
		extendedTimestamp,
		msDosCompatible,
		internalFileAttribute,
		externalFileAttribute,
		diskNumberStart
	};
	let compressedSize = 0;
	let uncompressedSize = 0;
	let signature;
	const { writable } = writer;
	if (reader) {
		reader.chunkSize = getChunkSize(config);
		await writeData(writable, localHeaderArray);
		const readable = reader.readable;
		const size = readable.size = reader.size;
		const workerOptions = {
			options: {
				codecType: CODEC_DEFLATE,
				level,
				rawPassword,
				password,
				encryptionStrength,
				zipCrypto: encrypted && zipCrypto,
				passwordVerification: encrypted && zipCrypto && (rawLastModDate >> 8) & 0xFF,
				signed: true,
				compressed,
				encrypted,
				useWebWorkers,
				useCompressionStream,
				transferStreams: false
			},
			config,
			streamOptions: { signal, size, onstart, onprogress, onend }
		};
		const result = await runWorker({ readable, writable }, workerOptions);
		uncompressedSize = result.inputSize;
		compressedSize = result.outputSize;
		signature = result.signature;
		writable.size += uncompressedSize;
	} else {
		await writeData(writable, localHeaderArray);
	}
	let rawExtraFieldZip64;
	if (zip64) {
		let rawExtraFieldZip64Length = 4;
		if (zip64UncompressedSize) {
			rawExtraFieldZip64Length += 8;
		}
		if (zip64CompressedSize) {
			rawExtraFieldZip64Length += 8;
		}
		if (zip64Offset) {
			rawExtraFieldZip64Length += 8;
		}
		if (zip64DiskNumberStart) {
			rawExtraFieldZip64Length += 4;
		}
		rawExtraFieldZip64 = new Uint8Array(rawExtraFieldZip64Length);
	} else {
		rawExtraFieldZip64 = new Uint8Array();
	}
	setEntryInfo({
		signature,
		rawExtraFieldZip64,
		compressedSize,
		uncompressedSize,
		headerInfo,
		dataDescriptorInfo
	}, options);
	if (dataDescriptor) {
		await writeData(writable, dataDescriptorArray);
	}
	Object.assign(fileEntry, {
		uncompressedSize,
		compressedSize,
		lastModDate,
		rawLastModDate,
		creationDate,
		lastAccessDate,
		encrypted,
		size: metadataSize + compressedSize,
		compressionMethod,
		version,
		headerArray,
		signature,
		rawExtraFieldZip64,
		extraFieldExtendedTimestampFlag,
		zip64UncompressedSize,
		zip64CompressedSize,
		zip64Offset,
		zip64DiskNumberStart
	});
	return fileEntry;
}

function getHeaderInfo(options) {
	const {
		rawFilename,
		lastModDate,
		lastAccessDate,
		creationDate,
		rawPassword,
		password,
		level,
		zip64,
		zipCrypto,
		dataDescriptor,
		directory,
		rawExtraField,
		encryptionStrength,
		extendedTimestamp
	} = options;
	const compressed = level !== 0 && !directory;
	const encrypted = Boolean((password && getLength(password)) || (rawPassword && getLength(rawPassword)));
	let version = options.version;
	let rawExtraFieldAES;
	if (encrypted && !zipCrypto) {
		rawExtraFieldAES = new Uint8Array(getLength(EXTRAFIELD_DATA_AES) + 2);
		const extraFieldAESView = getDataView(rawExtraFieldAES);
		setUint16(extraFieldAESView, 0, EXTRAFIELD_TYPE_AES);
		arraySet(rawExtraFieldAES, EXTRAFIELD_DATA_AES, 2);
		setUint8(extraFieldAESView, 8, encryptionStrength);
	} else {
		rawExtraFieldAES = new Uint8Array();
	}
	let rawExtraFieldNTFS;
	let rawExtraFieldExtendedTimestamp;
	let extraFieldExtendedTimestampFlag;
	if (extendedTimestamp) {
		rawExtraFieldExtendedTimestamp = new Uint8Array(9 + (lastAccessDate ? 4 : 0) + (creationDate ? 4 : 0));
		const extraFieldExtendedTimestampView = getDataView(rawExtraFieldExtendedTimestamp);
		setUint16(extraFieldExtendedTimestampView, 0, EXTRAFIELD_TYPE_EXTENDED_TIMESTAMP);
		setUint16(extraFieldExtendedTimestampView, 2, getLength(rawExtraFieldExtendedTimestamp) - 4);
		extraFieldExtendedTimestampFlag = 0x1 + (lastAccessDate ? 0x2 : 0) + (creationDate ? 0x4 : 0);
		setUint8(extraFieldExtendedTimestampView, 4, extraFieldExtendedTimestampFlag);
		let offset = 5;
		setUint32(extraFieldExtendedTimestampView, offset, Math.floor(lastModDate.getTime() / 1000));
		offset += 4;
		if (lastAccessDate) {
			setUint32(extraFieldExtendedTimestampView, offset, Math.floor(lastAccessDate.getTime() / 1000));
			offset += 4;
		}
		if (creationDate) {
			setUint32(extraFieldExtendedTimestampView, offset, Math.floor(creationDate.getTime() / 1000));
		}
		try {
			rawExtraFieldNTFS = new Uint8Array(36);
			const extraFieldNTFSView = getDataView(rawExtraFieldNTFS);
			const lastModTimeNTFS = getTimeNTFS(lastModDate);
			setUint16(extraFieldNTFSView, 0, EXTRAFIELD_TYPE_NTFS);
			setUint16(extraFieldNTFSView, 2, 32);
			setUint16(extraFieldNTFSView, 8, EXTRAFIELD_TYPE_NTFS_TAG1);
			setUint16(extraFieldNTFSView, 10, 24);
			setBigUint64(extraFieldNTFSView, 12, lastModTimeNTFS);
			setBigUint64(extraFieldNTFSView, 20, getTimeNTFS(lastAccessDate) || lastModTimeNTFS);
			setBigUint64(extraFieldNTFSView, 28, getTimeNTFS(creationDate) || lastModTimeNTFS);
		} catch (_error) {
			rawExtraFieldNTFS = new Uint8Array();
		}
	} else {
		rawExtraFieldNTFS = rawExtraFieldExtendedTimestamp = new Uint8Array();
	}
	let bitFlag = BITFLAG_LANG_ENCODING_FLAG;
	if (dataDescriptor) {
		bitFlag = bitFlag | BITFLAG_DATA_DESCRIPTOR;
	}
	let compressionMethod = COMPRESSION_METHOD_STORE;
	if (compressed) {
		compressionMethod = COMPRESSION_METHOD_DEFLATE;
	}
	if (zip64) {
		version = version > VERSION_ZIP64 ? version : VERSION_ZIP64;
	}
	if (encrypted) {
		bitFlag = bitFlag | BITFLAG_ENCRYPTED;
		if (!zipCrypto) {
			version = version > VERSION_AES ? version : VERSION_AES;
			compressionMethod = COMPRESSION_METHOD_AES;
			if (compressed) {
				rawExtraFieldAES[9] = COMPRESSION_METHOD_DEFLATE;
			}
		}
	}
	const headerArray = new Uint8Array(26);
	const headerView = getDataView(headerArray);
	setUint16(headerView, 0, version);
	setUint16(headerView, 2, bitFlag);
	setUint16(headerView, 4, compressionMethod);
	const dateArray = new Uint32Array(1);
	const dateView = getDataView(dateArray);
	let lastModDateMsDos;
	if (lastModDate < MIN_DATE) {
		lastModDateMsDos = MIN_DATE;
	} else if (lastModDate > MAX_DATE) {
		lastModDateMsDos = MAX_DATE;
	} else {
		lastModDateMsDos = lastModDate;
	}
	setUint16(dateView, 0, (((lastModDateMsDos.getHours() << 6) | lastModDateMsDos.getMinutes()) << 5) | lastModDateMsDos.getSeconds() / 2);
	setUint16(dateView, 2, ((((lastModDateMsDos.getFullYear() - 1980) << 4) | (lastModDateMsDos.getMonth() + 1)) << 5) | lastModDateMsDos.getDate());
	const rawLastModDate = dateArray[0];
	setUint32(headerView, 6, rawLastModDate);
	setUint16(headerView, 22, getLength(rawFilename));
	const extraFieldLength = getLength(rawExtraFieldAES, rawExtraFieldExtendedTimestamp, rawExtraFieldNTFS, rawExtraField);
	setUint16(headerView, 24, extraFieldLength);
	const localHeaderArray = new Uint8Array(30 + getLength(rawFilename) + extraFieldLength);
	const localHeaderView = getDataView(localHeaderArray);
	setUint32(localHeaderView, 0, LOCAL_FILE_HEADER_SIGNATURE);
	arraySet(localHeaderArray, headerArray, 4);
	arraySet(localHeaderArray, rawFilename, 30);
	arraySet(localHeaderArray, rawExtraFieldAES, 30 + getLength(rawFilename));
	arraySet(localHeaderArray, rawExtraFieldExtendedTimestamp, 30 + getLength(rawFilename, rawExtraFieldAES));
	arraySet(localHeaderArray, rawExtraFieldNTFS, 30 + getLength(rawFilename, rawExtraFieldAES, rawExtraFieldExtendedTimestamp));
	arraySet(localHeaderArray, rawExtraField, 30 + getLength(rawFilename, rawExtraFieldAES, rawExtraFieldExtendedTimestamp, rawExtraFieldNTFS));
	return {
		localHeaderArray,
		headerArray,
		headerView,
		lastModDate,
		rawLastModDate,
		encrypted,
		compressed,
		version,
		compressionMethod,
		extraFieldExtendedTimestampFlag,
		rawExtraFieldExtendedTimestamp,
		rawExtraFieldNTFS,
		rawExtraFieldAES,
		extraFieldLength
	};
}

function appendExtraFieldUSDZ(entryInfo, zipWriterOffset) {
	const { headerInfo } = entryInfo;
	let { localHeaderArray, extraFieldLength } = headerInfo;
	let localHeaderArrayView = getDataView(localHeaderArray);
	let extraBytesLength = 64 - ((zipWriterOffset + getLength(localHeaderArray)) % 64);
	if (extraBytesLength < 4) {
		extraBytesLength += 64;
	}
	const rawExtraFieldUSDZ = new Uint8Array(extraBytesLength);
	const extraFieldUSDZView = getDataView(rawExtraFieldUSDZ);
	setUint16(extraFieldUSDZView, 0, EXTRAFIELD_TYPE_USDZ);
	setUint16(extraFieldUSDZView, 2, extraBytesLength - 2);
	const previousLocalHeaderArray = localHeaderArray;
	headerInfo.localHeaderArray = localHeaderArray = new Uint8Array(getLength(previousLocalHeaderArray) + extraBytesLength);
	arraySet(localHeaderArray, previousLocalHeaderArray);
	arraySet(localHeaderArray, rawExtraFieldUSDZ, getLength(previousLocalHeaderArray));
	localHeaderArrayView = getDataView(localHeaderArray);
	setUint16(localHeaderArrayView, 28, extraFieldLength + extraBytesLength);
	entryInfo.metadataSize += extraBytesLength;
}

function getDataDescriptorInfo(options) {
	const {
		zip64,
		dataDescriptor,
		dataDescriptorSignature
	} = options;
	let dataDescriptorArray = new Uint8Array();
	let dataDescriptorView, dataDescriptorOffset = 0;
	if (dataDescriptor) {
		dataDescriptorArray = new Uint8Array(zip64 ? (dataDescriptorSignature ? 24 : 20) : (dataDescriptorSignature ? 16 : 12));
		dataDescriptorView = getDataView(dataDescriptorArray);
		if (dataDescriptorSignature) {
			dataDescriptorOffset = 4;
			setUint32(dataDescriptorView, 0, DATA_DESCRIPTOR_RECORD_SIGNATURE);
		}
	}
	return {
		dataDescriptorArray,
		dataDescriptorView,
		dataDescriptorOffset
	};
}

function setEntryInfo(entryInfo, options) {
	const {
		signature,
		rawExtraFieldZip64,
		compressedSize,
		uncompressedSize,
		headerInfo,
		dataDescriptorInfo
	} = entryInfo;
	const {
		headerView,
		encrypted
	} = headerInfo;
	const {
		dataDescriptorView,
		dataDescriptorOffset
	} = dataDescriptorInfo;
	const {
		zip64,
		zip64UncompressedSize,
		zip64CompressedSize,
		zipCrypto,
		dataDescriptor
	} = options;
	if ((!encrypted || zipCrypto) && signature !== UNDEFINED_VALUE) {
		setUint32(headerView, 10, signature);
		if (dataDescriptor) {
			setUint32(dataDescriptorView, dataDescriptorOffset, signature);
		}
	}
	if (zip64) {
		const rawExtraFieldZip64View = getDataView(rawExtraFieldZip64);
		setUint16(rawExtraFieldZip64View, 0, EXTRAFIELD_TYPE_ZIP64);
		setUint16(rawExtraFieldZip64View, 2, getLength(rawExtraFieldZip64) - 4);
		let rawExtraFieldZip64Offset = 4;
		if (zip64UncompressedSize) {
			setUint32(headerView, 18, MAX_32_BITS);
			setBigUint64(rawExtraFieldZip64View, rawExtraFieldZip64Offset, BigInt(uncompressedSize));
			rawExtraFieldZip64Offset += 8;
		}
		if (zip64CompressedSize) {
			setUint32(headerView, 14, MAX_32_BITS);
			setBigUint64(rawExtraFieldZip64View, rawExtraFieldZip64Offset, BigInt(compressedSize));
		}
		if (dataDescriptor) {
			setBigUint64(dataDescriptorView, dataDescriptorOffset + 4, BigInt(compressedSize));
			setBigUint64(dataDescriptorView, dataDescriptorOffset + 12, BigInt(uncompressedSize));
		}
	} else {
		setUint32(headerView, 14, compressedSize);
		setUint32(headerView, 18, uncompressedSize);
		if (dataDescriptor) {
			setUint32(dataDescriptorView, dataDescriptorOffset + 4, compressedSize);
			setUint32(dataDescriptorView, dataDescriptorOffset + 8, uncompressedSize);
		}
	}
}

async function writeExtraHeaderInfo(fileEntry, entryData, writable, { zipCrypto }) {
	let arrayBuffer;
	arrayBuffer = await entryData.slice(0, 26).arrayBuffer();
	if (arrayBuffer.byteLength != 26) {
		arrayBuffer = arrayBuffer.slice(0, 26);
	}
	const arrayBufferView = new DataView(arrayBuffer);
	if (!fileEntry.encrypted || zipCrypto) {
		setUint32(arrayBufferView, 14, fileEntry.signature);
	}
	if (fileEntry.zip64) {
		setUint32(arrayBufferView, 18, MAX_32_BITS);
		setUint32(arrayBufferView, 22, MAX_32_BITS);
	} else {
		setUint32(arrayBufferView, 18, fileEntry.compressedSize);
		setUint32(arrayBufferView, 22, fileEntry.uncompressedSize);
	}
	await writeData(writable, new Uint8Array(arrayBuffer));
	return entryData.slice(arrayBuffer.byteLength);
}

function setZip64ExtraInfo(fileEntry, options) {
	const { rawExtraFieldZip64, offset, diskNumberStart } = fileEntry;
	const { zip64UncompressedSize, zip64CompressedSize, zip64Offset, zip64DiskNumberStart } = options;
	const rawExtraFieldZip64View = getDataView(rawExtraFieldZip64);
	let rawExtraFieldZip64Offset = 4;
	if (zip64UncompressedSize) {
		rawExtraFieldZip64Offset += 8;
	}
	if (zip64CompressedSize) {
		rawExtraFieldZip64Offset += 8;
	}
	if (zip64Offset) {
		setBigUint64(rawExtraFieldZip64View, rawExtraFieldZip64Offset, BigInt(offset));
		rawExtraFieldZip64Offset += 8;
	}
	if (zip64DiskNumberStart) {
		setUint32(rawExtraFieldZip64View, rawExtraFieldZip64Offset, diskNumberStart);
	}
}

async function closeFile(zipWriter, comment, options) {
	const { files, writer } = zipWriter;
	const { diskOffset, writable } = writer;
	let { diskNumber } = writer;
	let offset = 0;
	let directoryDataLength = 0;
	let directoryOffset = zipWriter.offset - diskOffset;
	let filesLength = files.size;
	for (const [, fileEntry] of files) {
		const {
			rawFilename,
			rawExtraFieldZip64,
			rawExtraFieldAES,
			rawComment,
			rawExtraFieldNTFS,
			rawExtraField,
			extendedTimestamp,
			extraFieldExtendedTimestampFlag,
			lastModDate
		} = fileEntry;
		let rawExtraFieldTimestamp;
		if (extendedTimestamp) {
			rawExtraFieldTimestamp = new Uint8Array(9);
			const extraFieldExtendedTimestampView = getDataView(rawExtraFieldTimestamp);
			setUint16(extraFieldExtendedTimestampView, 0, EXTRAFIELD_TYPE_EXTENDED_TIMESTAMP);
			setUint16(extraFieldExtendedTimestampView, 2, 5);
			setUint8(extraFieldExtendedTimestampView, 4, extraFieldExtendedTimestampFlag);
			setUint32(extraFieldExtendedTimestampView, 5, Math.floor(lastModDate.getTime() / 1000));
		} else {
			rawExtraFieldTimestamp = new Uint8Array();
		}
		fileEntry.rawExtraFieldCDExtendedTimestamp = rawExtraFieldTimestamp;
		directoryDataLength += 46 +
			getLength(
				rawFilename,
				rawComment,
				rawExtraFieldZip64,
				rawExtraFieldAES,
				rawExtraFieldNTFS,
				rawExtraFieldTimestamp,
				rawExtraField);
	}
	const directoryArray = new Uint8Array(directoryDataLength);
	const directoryView = getDataView(directoryArray);
	await initStream(writer);
	let directoryDiskOffset = 0;
	for (const [indexFileEntry, fileEntry] of Array.from(files.values()).entries()) {
		const {
			offset: fileEntryOffset,
			rawFilename,
			rawExtraFieldZip64,
			rawExtraFieldAES,
			rawExtraFieldCDExtendedTimestamp,
			rawExtraFieldNTFS,
			rawExtraField,
			rawComment,
			versionMadeBy,
			headerArray,
			directory,
			zip64,
			zip64UncompressedSize,
			zip64CompressedSize,
			zip64DiskNumberStart,
			zip64Offset,
			msDosCompatible,
			internalFileAttribute,
			externalFileAttribute,
			diskNumberStart,
			uncompressedSize,
			compressedSize
		} = fileEntry;
		const extraFieldLength = getLength(rawExtraFieldZip64, rawExtraFieldAES, rawExtraFieldCDExtendedTimestamp, rawExtraFieldNTFS, rawExtraField);
		setUint32(directoryView, offset, CENTRAL_FILE_HEADER_SIGNATURE);
		setUint16(directoryView, offset + 4, versionMadeBy);
		const headerView = getDataView(headerArray);
		if (!zip64UncompressedSize) {
			setUint32(headerView, 18, uncompressedSize);
		}
		if (!zip64CompressedSize) {
			setUint32(headerView, 14, compressedSize);
		}
		arraySet(directoryArray, headerArray, offset + 6);
		setUint16(directoryView, offset + 30, extraFieldLength);
		setUint16(directoryView, offset + 32, getLength(rawComment));
		setUint16(directoryView, offset + 34, zip64 && zip64DiskNumberStart ? MAX_16_BITS : diskNumberStart);
		setUint16(directoryView, offset + 36, internalFileAttribute);
		if (externalFileAttribute) {
			setUint32(directoryView, offset + 38, externalFileAttribute);
		} else if (directory && msDosCompatible) {
			setUint8(directoryView, offset + 38, FILE_ATTR_MSDOS_DIR_MASK);
		}
		setUint32(directoryView, offset + 42, zip64 && zip64Offset ? MAX_32_BITS : fileEntryOffset);
		arraySet(directoryArray, rawFilename, offset + 46);
		arraySet(directoryArray, rawExtraFieldZip64, offset + 46 + getLength(rawFilename));
		arraySet(directoryArray, rawExtraFieldAES, offset + 46 + getLength(rawFilename, rawExtraFieldZip64));
		arraySet(directoryArray, rawExtraFieldCDExtendedTimestamp, offset + 46 + getLength(rawFilename, rawExtraFieldZip64, rawExtraFieldAES));
		arraySet(directoryArray, rawExtraFieldNTFS, offset + 46 + getLength(rawFilename, rawExtraFieldZip64, rawExtraFieldAES, rawExtraFieldCDExtendedTimestamp));
		arraySet(directoryArray, rawExtraField, offset + 46 + getLength(rawFilename, rawExtraFieldZip64, rawExtraFieldAES, rawExtraFieldCDExtendedTimestamp, rawExtraFieldNTFS));
		arraySet(directoryArray, rawComment, offset + 46 + getLength(rawFilename) + extraFieldLength);
		const directoryEntryLength = 46 + getLength(rawFilename, rawComment) + extraFieldLength;
		if (offset - directoryDiskOffset > writer.availableSize) {
			writer.availableSize = 0;
			await writeData(writable, directoryArray.slice(directoryDiskOffset, offset));
			directoryDiskOffset = offset;
		}
		offset += directoryEntryLength;
		if (options.onprogress) {
			try {
				await options.onprogress(indexFileEntry + 1, files.size, new Entry(fileEntry));
			} catch (_error) {
				// ignored
			}
		}
	}
	await writeData(writable, directoryDiskOffset ? directoryArray.slice(directoryDiskOffset) : directoryArray);
	let lastDiskNumber = writer.diskNumber;
	const { availableSize } = writer;
	if (availableSize < END_OF_CENTRAL_DIR_LENGTH) {
		lastDiskNumber++;
	}
	let zip64 = getOptionValue(zipWriter, options, "zip64");
	if (directoryOffset > MAX_32_BITS || directoryDataLength > MAX_32_BITS || filesLength > MAX_16_BITS || lastDiskNumber > MAX_16_BITS) {
		if (zip64 === false) {
			throw new Error(ERR_UNSUPPORTED_FORMAT);
		} else {
			zip64 = true;
		}
	}
	const endOfdirectoryArray = new Uint8Array(zip64 ? ZIP64_END_OF_CENTRAL_DIR_TOTAL_LENGTH : END_OF_CENTRAL_DIR_LENGTH);
	const endOfdirectoryView = getDataView(endOfdirectoryArray);
	offset = 0;
	if (zip64) {
		setUint32(endOfdirectoryView, 0, ZIP64_END_OF_CENTRAL_DIR_SIGNATURE);
		setBigUint64(endOfdirectoryView, 4, BigInt(44));
		setUint16(endOfdirectoryView, 12, 45);
		setUint16(endOfdirectoryView, 14, 45);
		setUint32(endOfdirectoryView, 16, lastDiskNumber);
		setUint32(endOfdirectoryView, 20, diskNumber);
		setBigUint64(endOfdirectoryView, 24, BigInt(filesLength));
		setBigUint64(endOfdirectoryView, 32, BigInt(filesLength));
		setBigUint64(endOfdirectoryView, 40, BigInt(directoryDataLength));
		setBigUint64(endOfdirectoryView, 48, BigInt(directoryOffset));
		setUint32(endOfdirectoryView, 56, ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIGNATURE);
		setBigUint64(endOfdirectoryView, 64, BigInt(directoryOffset) + BigInt(directoryDataLength));
		setUint32(endOfdirectoryView, 72, lastDiskNumber + 1);
		const supportZip64SplitFile = getOptionValue(zipWriter, options, "supportZip64SplitFile", true);
		if (supportZip64SplitFile) {
			lastDiskNumber = MAX_16_BITS;
			diskNumber = MAX_16_BITS;
		}
		filesLength = MAX_16_BITS;
		directoryOffset = MAX_32_BITS;
		directoryDataLength = MAX_32_BITS;
		offset += ZIP64_END_OF_CENTRAL_DIR_LENGTH + ZIP64_END_OF_CENTRAL_DIR_LOCATOR_LENGTH;
	}
	setUint32(endOfdirectoryView, offset, END_OF_CENTRAL_DIR_SIGNATURE);
	setUint16(endOfdirectoryView, offset + 4, lastDiskNumber);
	setUint16(endOfdirectoryView, offset + 6, diskNumber);
	setUint16(endOfdirectoryView, offset + 8, filesLength);
	setUint16(endOfdirectoryView, offset + 10, filesLength);
	setUint32(endOfdirectoryView, offset + 12, directoryDataLength);
	setUint32(endOfdirectoryView, offset + 16, directoryOffset);
	const commentLength = getLength(comment);
	if (commentLength) {
		if (commentLength <= MAX_16_BITS) {
			setUint16(endOfdirectoryView, offset + 20, commentLength);
		} else {
			throw new Error(ERR_INVALID_COMMENT);
		}
	}
	await writeData(writable, endOfdirectoryArray);
	if (commentLength) {
		await writeData(writable, comment);
	}
}

async function writeData(writable, array) {
	const streamWriter = writable.getWriter();
	try {
		await streamWriter.ready;
		writable.size += getLength(array);
		await streamWriter.write(array);
	} finally {
		streamWriter.releaseLock();
	}
}

function getTimeNTFS(date) {
	if (date) {
		return ((BigInt(date.getTime()) + BigInt(11644473600000)) * BigInt(10000));
	}
}

function getOptionValue(zipWriter, options, name, defaultValue) {
	const result = options[name] === UNDEFINED_VALUE ? zipWriter.options[name] : options[name];
	return result === UNDEFINED_VALUE ? defaultValue : result;
}

function getMaximumCompressedSize(uncompressedSize) {
	return uncompressedSize + (5 * (Math.floor(uncompressedSize / 16383) + 1));
}

function setUint8(view, offset, value) {
	view.setUint8(offset, value);
}

function setUint16(view, offset, value) {
	view.setUint16(offset, value, true);
}

function setUint32(view, offset, value) {
	view.setUint32(offset, value, true);
}

function setBigUint64(view, offset, value) {
	view.setBigUint64(offset, value, true);
}

function arraySet(array, typedArray, offset) {
	array.set(typedArray, offset);
}

function getDataView(array) {
	return new DataView(array.buffer);
}

function getLength(...arrayLikes) {
	let result = 0;
	arrayLikes.forEach(arrayLike => arrayLike && (result += arrayLike.length));
	return result;
}

/*
 Copyright (c) 2022 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


let baseURL;
try {
	baseURL = import.meta.url;
} catch (_error) {
	// ignored
}
configure({ baseURL });
e(configure);

// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
// https://tools.ietf.org/html/rfc1951
// You may also wish to take a look at the guide I made about this program:
// https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
// Some of the following code is similar to that of UZIP.js:
// https://github.com/photopea/UZIP.js
// However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
// Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
// is better for memory in most engines (I *think*).

// aliases for shorter compressed code (most minifers don't do this)
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
// fixed length extra bits
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
// fixed distance extra bits
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
// code length index map
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
// get base, reverse index map from extra bits
var freb = function (eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1];
    }
    // numbers here are at max 18 bits
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
        for (var j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i;
        }
    }
    return { b: b, r: r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b.b, revfd = _b.r;
// map of value to reverse (assuming 16 bits)
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    var x = ((i & 0xAAAA) >> 1) | ((i & 0x5555) << 1);
    x = ((x & 0xCCCC) >> 2) | ((x & 0x3333) << 2);
    x = ((x & 0xF0F0) >> 4) | ((x & 0x0F0F) << 4);
    rev[i] = (((x & 0xFF00) >> 8) | ((x & 0x00FF) << 8)) >> 1;
}
// create huffman tree from u8 "map": index -> code length for code index
// mb (max bits) must be at most 15
// TODO: optimize/split up?
var hMap = (function (cd, mb, r) {
    var s = cd.length;
    // index
    var i = 0;
    // u16 "map": index -> # of codes with bit length = index
    var l = new u16(mb);
    // length of cd must be 288 (total # of codes)
    for (; i < s; ++i) {
        if (cd[i])
            ++l[cd[i] - 1];
    }
    // u16 "map": index -> minimum code for bit length = index
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
        le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    var co;
    if (r) {
        // u16 "map": index -> number of actual bits, symbol for code
        co = new u16(1 << mb);
        // bits to remove for reverser
        var rvb = 15 - mb;
        for (i = 0; i < s; ++i) {
            // ignore 0 lengths
            if (cd[i]) {
                // num encoding both symbol and bits read
                var sv = (i << 4) | cd[i];
                // free bits
                var r_1 = mb - cd[i];
                // start value
                var v = le[cd[i] - 1]++ << r_1;
                // m is end value
                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                    // every 16 bit value starting with the code yields the same result
                    co[rev[v] >> rvb] = sv;
                }
            }
        }
    }
    else {
        co = new u16(s);
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
            }
        }
    }
    return co;
});
// fixed length tree
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
    flt[i] = 8;
for (var i = 144; i < 256; ++i)
    flt[i] = 9;
for (var i = 256; i < 280; ++i)
    flt[i] = 7;
for (var i = 280; i < 288; ++i)
    flt[i] = 8;
// fixed distance tree
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
// fixed length map
var flm = /*#__PURE__*/ hMap(flt, 9, 0), flrm = /*#__PURE__*/ hMap(flt, 9, 1);
// fixed distance map
var fdm = /*#__PURE__*/ hMap(fdt, 5, 0), fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
// find max of array
var max = function (a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
        if (a[i] > m)
            m = a[i];
    }
    return m;
};
// read d, starting at bit p and mask with m
var bits = function (d, p, m) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
};
// read d, starting at bit p continuing for at least 16 bits
var bits16 = function (d, p) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7));
};
// get end of byte
var shft = function (p) { return ((p + 7) / 8) | 0; };
// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
var slc = function (v, s, e) {
    if (e == null || e > v.length)
        e = v.length;
    // can't use .constructor in case user-supplied
    return new u8(v.subarray(s, e));
};
// error codes
var ec = [
    'unexpected EOF',
    'invalid block type',
    'invalid length/literal',
    'invalid distance',
    'stream finished',
    'no stream handler',
    , // determined by compression function
    'no callback',
    'invalid UTF-8 data',
    'extra field too long',
    'date not in range 1980-2099',
    'filename too long',
    'stream finishing',
    'invalid zip data'
    // determined by unknown compression method
];
var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
        Error.captureStackTrace(e, err);
    if (!nt)
        throw e;
    return e;
};
// expands raw DEFLATE data
var inflt = function (dat, st, buf, dict) {
    // source length       dict length
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
        return buf || new u8(0);
    var noBuf = !buf;
    // have to estimate size
    var resize = noBuf || st.i != 2;
    // no state
    var noSt = st.i;
    // Assumes roughly 33% compression ratio average
    if (noBuf)
        buf = new u8(sl * 3);
    // ensure buffer can fit at least l elements
    var cbuf = function (l) {
        var bl = buf.length;
        // need to increase size to fit
        if (l > bl) {
            // Double or set to necessary, whichever is greater
            var nbuf = new u8(Math.max(bl * 2, l));
            nbuf.set(buf);
            buf = nbuf;
        }
    };
    //  last chunk         bitpos           bytes
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    // total bits
    var tbts = sl * 8;
    do {
        if (!lm) {
            // BFINAL - this is only 1 when last chunk is next
            final = bits(dat, pos, 1);
            // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
            var type = bits(dat, pos + 1, 3);
            pos += 3;
            if (!type) {
                // go to end of byte boundary
                var s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
                if (t > sl) {
                    if (noSt)
                        err(0);
                    break;
                }
                // ensure size
                if (resize)
                    cbuf(bt + l);
                // Copy over uncompressed data
                buf.set(dat.subarray(s, t), bt);
                // Get new bitpos, update byte count
                st.b = bt += l, st.p = pos = t * 8, st.f = final;
                continue;
            }
            else if (type == 1)
                lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
            else if (type == 2) {
                //  literal                            lengths
                var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
                var tl = hLit + bits(dat, pos + 5, 31) + 1;
                pos += 14;
                // length+distance tree
                var ldt = new u8(tl);
                // code length tree
                var clt = new u8(19);
                for (var i = 0; i < hcLen; ++i) {
                    // use index map to get real code
                    clt[clim[i]] = bits(dat, pos + i * 3, 7);
                }
                pos += hcLen * 3;
                // code lengths bits
                var clb = max(clt), clbmsk = (1 << clb) - 1;
                // code lengths map
                var clm = hMap(clt, clb, 1);
                for (var i = 0; i < tl;) {
                    var r = clm[bits(dat, pos, clbmsk)];
                    // bits read
                    pos += r & 15;
                    // symbol
                    var s = r >> 4;
                    // code length to copy
                    if (s < 16) {
                        ldt[i++] = s;
                    }
                    else {
                        //  copy   count
                        var c = 0, n = 0;
                        if (s == 16)
                            n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
                        else if (s == 17)
                            n = 3 + bits(dat, pos, 7), pos += 3;
                        else if (s == 18)
                            n = 11 + bits(dat, pos, 127), pos += 7;
                        while (n--)
                            ldt[i++] = c;
                    }
                }
                //    length tree                 distance tree
                var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
                // max length bits
                lbt = max(lt);
                // max dist bits
                dbt = max(dt);
                lm = hMap(lt, lbt, 1);
                dm = hMap(dt, dbt, 1);
            }
            else
                err(1);
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
        }
        // Make sure the buffer can hold this + the largest possible addition
        // Maximum chunk size (practically, theoretically infinite) is 2^17
        if (resize)
            cbuf(bt + 131072);
        var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
        var lpos = pos;
        for (;; lpos = pos) {
            // bits read, code
            var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
            pos += c & 15;
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
            if (!c)
                err(2);
            if (sym < 256)
                buf[bt++] = sym;
            else if (sym == 256) {
                lpos = pos, lm = null;
                break;
            }
            else {
                var add = sym - 254;
                // no extra bits needed if less
                if (sym > 264) {
                    // index
                    var i = sym - 257, b = fleb[i];
                    add = bits(dat, pos, (1 << b) - 1) + fl[i];
                    pos += b;
                }
                // dist
                var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
                if (!d)
                    err(3);
                pos += d & 15;
                var dt = fd[dsym];
                if (dsym > 3) {
                    var b = fdeb[dsym];
                    dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
                }
                if (pos > tbts) {
                    if (noSt)
                        err(0);
                    break;
                }
                if (resize)
                    cbuf(bt + 131072);
                var end = bt + add;
                if (bt < dt) {
                    var shift = dl - dt, dend = Math.min(dt, end);
                    if (shift + bt < 0)
                        err(3);
                    for (; bt < dend; ++bt)
                        buf[bt] = dict[shift + bt];
                }
                for (; bt < end; ++bt)
                    buf[bt] = buf[bt - dt];
            }
        }
        st.l = lm, st.p = lpos, st.b = bt, st.f = final;
        if (lm)
            final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    // don't reallocate for streams or user buffers
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
// starting at p, write the minimum number of bits that can hold v to d
var wbits = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
};
// starting at p, write the minimum number of bits (>8) that can hold v to d
var wbits16 = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
};
// creates code lengths from a frequency table
var hTree = function (d, mb) {
    // Need extra info to make a tree
    var t = [];
    for (var i = 0; i < d.length; ++i) {
        if (d[i])
            t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
        return { t: et, l: 0 };
    if (s == 1) {
        var v = new u8(t[0].s + 1);
        v[t[0].s] = 1;
        return { t: v, l: 1 };
    }
    t.sort(function (a, b) { return a.f - b.f; });
    // after i2 reaches last ind, will be stopped
    // freq must be greater than largest possible number of symbols
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l: l, r: r };
    // efficient algorithm from UZIP.js
    // i0 is lookbehind, i2 is lookahead - after processing two low-freq
    // symbols that combined have high freq, will start processing i2 (high-freq,
    // non-composite) symbols instead
    // see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/
    while (i1 != s - 1) {
        l = t[t[i0].f < t[i2].f ? i0++ : i2++];
        r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
        t[i1++] = { s: -1, f: l.f + r.f, l: l, r: r };
    }
    var maxSym = t2[0].s;
    for (var i = 1; i < s; ++i) {
        if (t2[i].s > maxSym)
            maxSym = t2[i].s;
    }
    // code lengths
    var tr = new u16(maxSym + 1);
    // max bits in tree
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
        // more algorithms from UZIP.js
        // TODO: find out how this code works (debt)
        //  ind    debt
        var i = 0, dt = 0;
        //    left            cost
        var lft = mbt - mb, cst = 1 << lft;
        t2.sort(function (a, b) { return tr[b.s] - tr[a.s] || a.f - b.f; });
        for (; i < s; ++i) {
            var i2_1 = t2[i].s;
            if (tr[i2_1] > mb) {
                dt += cst - (1 << (mbt - tr[i2_1]));
                tr[i2_1] = mb;
            }
            else
                break;
        }
        dt >>= lft;
        while (dt > 0) {
            var i2_2 = t2[i].s;
            if (tr[i2_2] < mb)
                dt -= 1 << (mb - tr[i2_2]++ - 1);
            else
                ++i;
        }
        for (; i >= 0 && dt; --i) {
            var i2_3 = t2[i].s;
            if (tr[i2_3] == mb) {
                --tr[i2_3];
                ++dt;
            }
        }
        mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
};
// get the max length and assign length codes
var ln = function (n, l, d) {
    return n.s == -1
        ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1))
        : (l[n.s] = d);
};
// length codes generation
var lc = function (c) {
    var s = c.length;
    // Note that the semicolon was intentional
    while (s && !c[--s])
        ;
    var cl = new u16(++s);
    //  ind      num         streak
    var cli = 0, cln = c[0], cls = 1;
    var w = function (v) { cl[cli++] = v; };
    for (var i = 1; i <= s; ++i) {
        if (c[i] == cln && i != s)
            ++cls;
        else {
            if (!cln && cls > 2) {
                for (; cls > 138; cls -= 138)
                    w(32754);
                if (cls > 2) {
                    w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305);
                    cls = 0;
                }
            }
            else if (cls > 3) {
                w(cln), --cls;
                for (; cls > 6; cls -= 6)
                    w(8304);
                if (cls > 2)
                    w(((cls - 3) << 5) | 8208), cls = 0;
            }
            while (cls--)
                w(cln);
            cls = 1;
            cln = c[i];
        }
    }
    return { c: cl.subarray(0, cli), n: s };
};
// calculate the length of output from tree, code lengths
var clen = function (cf, cl) {
    var l = 0;
    for (var i = 0; i < cl.length; ++i)
        l += cf[i] * cl[i];
    return l;
};
// writes a fixed block
// returns the new bit pos
var wfblk = function (out, pos, dat) {
    // no need to write 00 as type: TypedArray defaults to 0
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0; i < s; ++i)
        out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
};
// writes a block
var wblk = function (dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a = hTree(lf, 15), dlt = _a.t, mlb = _a.l;
    var _b = hTree(df, 15), ddt = _b.t, mdb = _b.l;
    var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
    var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i = 0; i < lclt.length; ++i)
        ++lcfreq[lclt[i] & 31];
    for (var i = 0; i < lcdt.length; ++i)
        ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
        ;
    var flen = (bl + 5) << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
        return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
        lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
        var llm = hMap(lct, mlcb, 0);
        wbits(out, p, nlc - 257);
        wbits(out, p + 5, ndc - 1);
        wbits(out, p + 10, nlcc - 4);
        p += 14;
        for (var i = 0; i < nlcc; ++i)
            wbits(out, p + 3 * i, lct[clim[i]]);
        p += 3 * nlcc;
        var lcts = [lclt, lcdt];
        for (var it = 0; it < 2; ++it) {
            var clct = lcts[it];
            for (var i = 0; i < clct.length; ++i) {
                var len = clct[i] & 31;
                wbits(out, p, llm[len]), p += lct[len];
                if (len > 15)
                    wbits(out, p, (clct[i] >> 5) & 127), p += clct[i] >> 12;
            }
        }
    }
    else {
        lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0; i < li; ++i) {
        var sym = syms[i];
        if (sym > 255) {
            var len = (sym >> 18) & 31;
            wbits16(out, p, lm[len + 257]), p += ll[len + 257];
            if (len > 7)
                wbits(out, p, (sym >> 23) & 31), p += fleb[len];
            var dst = sym & 31;
            wbits16(out, p, dm[dst]), p += dl[dst];
            if (dst > 3)
                wbits16(out, p, (sym >> 5) & 8191), p += fdeb[dst];
        }
        else {
            wbits16(out, p, lm[sym]), p += ll[sym];
        }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
};
// deflate options (nice << 13) | chain
var deo = /*#__PURE__*/ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
// empty
var et = /*#__PURE__*/ new u8(0);
// compresses data into a raw DEFLATE buffer
var dflt = function (dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
    // writing to this writes to the output buffer
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
        if (pos)
            w[0] = st.r >> 3;
        var opt = deo[lvl - 1];
        var n = opt >> 13, c = opt & 8191;
        var msk_1 = (1 << plvl) - 1;
        //    prev 2-byte val map    curr 2-byte val map
        var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
        var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
        var hsh = function (i) { return (dat[i] ^ (dat[i + 1] << bs1_1) ^ (dat[i + 2] << bs2_1)) & msk_1; };
        // 24576 is an arbitrary number of maximum symbols per block
        // 424 buffer for last block
        var syms = new i32(25000);
        // length/literal freq   distance freq
        var lf = new u16(288), df = new u16(32);
        //  l/lcnt  exbits  index          l/lind  waitdx          blkpos
        var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
        for (; i + 2 < s; ++i) {
            // hash value
            var hv = hsh(i);
            // index mod 32768    previous index mod
            var imod = i & 32767, pimod = head[hv];
            prev[imod] = pimod;
            head[hv] = imod;
            // We always should modify head and prev, but only add symbols if
            // this data is not yet processed ("wait" for wait index)
            if (wi <= i) {
                // bytes remaining
                var rem = s - i;
                if ((lc_1 > 7000 || li > 24576) && (rem > 423 || !lst)) {
                    pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
                    li = lc_1 = eb = 0, bs = i;
                    for (var j = 0; j < 286; ++j)
                        lf[j] = 0;
                    for (var j = 0; j < 30; ++j)
                        df[j] = 0;
                }
                //  len    dist   chain
                var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
                if (rem > 2 && hv == hsh(i - dif)) {
                    var maxn = Math.min(n, rem) - 1;
                    var maxd = Math.min(32767, i);
                    // max possible length
                    // not capped at dif because decompressors implement "rolling" index population
                    var ml = Math.min(258, rem);
                    while (dif <= maxd && --ch_1 && imod != pimod) {
                        if (dat[i + l] == dat[i + l - dif]) {
                            var nl = 0;
                            for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                                ;
                            if (nl > l) {
                                l = nl, d = dif;
                                // break out early when we reach "nice" (we are satisfied enough)
                                if (nl > maxn)
                                    break;
                                // now, find the rarest 2-byte sequence within this
                                // length of literals and search for that instead.
                                // Much faster than just using the start
                                var mmd = Math.min(dif, nl - 2);
                                var md = 0;
                                for (var j = 0; j < mmd; ++j) {
                                    var ti = i - dif + j & 32767;
                                    var pti = prev[ti];
                                    var cd = ti - pti & 32767;
                                    if (cd > md)
                                        md = cd, pimod = ti;
                                }
                            }
                        }
                        // check the previous match
                        imod = pimod, pimod = prev[imod];
                        dif += imod - pimod & 32767;
                    }
                }
                // d will be nonzero only when a match was found
                if (d) {
                    // store both dist and len data in one int32
                    // Make sure this is recognized as a len/dist with 28th bit (2^28)
                    syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d];
                    var lin = revfl[l] & 31, din = revfd[d] & 31;
                    eb += fleb[lin] + fdeb[din];
                    ++lf[257 + lin];
                    ++df[din];
                    wi = i + l;
                    ++lc_1;
                }
                else {
                    syms[li++] = dat[i];
                    ++lf[dat[i]];
                }
            }
        }
        for (i = Math.max(i, wi); i < s; ++i) {
            syms[li++] = dat[i];
            ++lf[dat[i]];
        }
        pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
        if (!lst) {
            st.r = (pos & 7) | w[(pos / 8) | 0] << 3;
            // shft(pos) now 1 less if pos & 7 != 0
            pos -= 7;
            st.h = head, st.p = prev, st.i = i, st.w = wi;
        }
    }
    else {
        for (var i = st.w || 0; i < s + lst; i += 65535) {
            // end
            var e = i + 65535;
            if (e >= s) {
                // write final block
                w[(pos / 8) | 0] = lst;
                e = s;
            }
            pos = wfblk(w, pos + 1, dat.subarray(i, e));
        }
        st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
};
// deflate with opts
var dopt = function (dat, opt, pre, post, st) {
    if (!st) {
        st = { l: 1 };
        if (opt.dictionary) {
            var dict = opt.dictionary.subarray(-32768);
            var newDat = new u8(dict.length + dat.length);
            newDat.set(dict);
            newDat.set(dat, dict.length);
            dat = newDat;
            st.w = dict.length;
        }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? (st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20) : (12 + opt.mem), pre, post, st);
};
/**
 * Compresses data with DEFLATE without any wrapper
 * @param data The data to compress
 * @param opts The compression options
 * @returns The deflated version of the data
 */
function deflateSync(data, opts) {
    return dopt(data, opts || {}, 0, 0);
}
function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
// text decoder
var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
// text decoder stream
var tds = 0;
try {
    td.decode(et, { stream: true });
    tds = 1;
}
catch (e) { }

export { BlobReader, BlobWriter, Data64URIReader, Data64URIWriter, ERR_BAD_FORMAT, ERR_CENTRAL_DIRECTORY_NOT_FOUND, ERR_DUPLICATED_NAME, ERR_ENCRYPTED, ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND, ERR_EOCDR_NOT_FOUND, ERR_EXTRAFIELD_ZIP64_NOT_FOUND, ERR_HTTP_RANGE, ERR_INVALID_COMMENT, ERR_INVALID_ENCRYPTION_STRENGTH, ERR_INVALID_ENTRY_COMMENT, ERR_INVALID_ENTRY_NAME, ERR_INVALID_EXTRAFIELD_DATA, ERR_INVALID_EXTRAFIELD_TYPE, ERR_INVALID_PASSWORD, ERR_INVALID_SIGNATURE, ERR_INVALID_VERSION, ERR_ITERATOR_COMPLETED_TOO_SOON, ERR_LOCAL_FILE_HEADER_NOT_FOUND, ERR_SPLIT_ZIP_FILE, ERR_UNSUPPORTED_COMPRESSION, ERR_UNSUPPORTED_ENCRYPTION, ERR_UNSUPPORTED_FORMAT, HttpRangeReader, HttpReader, Reader, SplitDataReader, SplitDataWriter, SplitZipReader, SplitZipWriter, TextReader, TextWriter, Uint8ArrayReader, Uint8ArrayWriter, Writer, ZipReader, ZipReaderStream, ZipWriter, ZipWriterStream, configure, deflateSync as deflateRaw, getMimeType, inflateSync as inflateRaw, initReader, initShimAsyncCodec, initStream, initWriter, readUint8Array, terminateWorkers };
