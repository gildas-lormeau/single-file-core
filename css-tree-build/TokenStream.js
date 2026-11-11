import { cmpStr } from "./utils.js";
import tokenNames from "./names.js";
import {
	WhiteSpace,
	Comment,
	Delim,
	EOF,
	Function as FunctionToken,
	LeftParenthesis,
	RightParenthesis,
	LeftSquareBracket,
	RightSquareBracket,
	LeftCurlyBracket,
	RightCurlyBracket
} from "./types.js";

// Keep all 32 offset bits without bitwise operators truncating the token word.
// A token type and Uint32 offset fit exactly within a Float64's 53 integer bits.
const TYPE_FACTOR = 0x100000000;

function unpackTokenType(value) {
	return Math.floor((value || 0) / TYPE_FACTOR);
}

function unpackTokenOffset(value) {
	return (value || 0) % TYPE_FACTOR;
}
const BLOCK_OPEN_TOKEN = 1;
const BLOCK_CLOSE_TOKEN = 2;
const balancePair = new Uint8Array(32); // 32b of memory ought to be enough for anyone (any number of tokens)
balancePair[FunctionToken] = RightParenthesis;
balancePair[LeftParenthesis] = RightParenthesis;
balancePair[LeftSquareBracket] = RightSquareBracket;
balancePair[LeftCurlyBracket] = RightCurlyBracket;

const blockTokens = new Uint8Array(32);
blockTokens[FunctionToken] = BLOCK_OPEN_TOKEN;
blockTokens[LeftParenthesis] = BLOCK_OPEN_TOKEN;
blockTokens[LeftSquareBracket] = BLOCK_OPEN_TOKEN;
blockTokens[LeftCurlyBracket] = BLOCK_OPEN_TOKEN;
blockTokens[RightParenthesis] = BLOCK_CLOSE_TOKEN;
blockTokens[RightSquareBracket] = BLOCK_CLOSE_TOKEN;
blockTokens[RightCurlyBracket] = BLOCK_CLOSE_TOKEN;

function boundIndex(index, min, max) {
	return index < min ? min : index > max ? max : index;
}

export class TokenStream {
	constructor(source, tokenize) {
		this.setSource(source, tokenize);
	}
	reset() {
		this.eof = false;
		this.tokenIndex = -1;
		this.tokenType = 0;
		this.tokenStart = this.firstCharOffset;
		this.tokenEnd = this.firstCharOffset;
	}
	setSource(source = "", tokenize = () => {}) {
		source = String(source || "");

		const sourceLength = source.length;
		const maxCapacity = sourceLength + 1; // include the EOF sentinel
		let offsetAndType = this.offsetAndType || new Float64Array(Math.min(16384, maxCapacity));
		let balance = this.balance || new Uint32Array(Math.min(16384, maxCapacity));
		let tokenCount = 0;
		let firstCharOffset = -1;
		let balanceCloseType = 0;
		let balanceStart = source.length;

		// capture buffers
		this.offsetAndType = null;
		this.balance = null;
		// Every used balance entry is assigned below before it is read.
		// Do not allocate or clear one entry per source character: a large
		// embedded URL may occupy hundreds of megabytes but only one token.

		tokenize(source, (type, start, end) => {
			const index = tokenCount++;

			if (tokenCount >= offsetAndType.length) {
				const capacity = Math.min(maxCapacity, offsetAndType.length * 2);
				const nextOffsetAndType = new Float64Array(capacity);
				const nextBalance = new Uint32Array(capacity);
				nextOffsetAndType.set(offsetAndType);
				nextBalance.set(balance);
				offsetAndType = nextOffsetAndType;
				balance = nextBalance;
			}

			// type & offset
			offsetAndType[index] = type * TYPE_FACTOR + end;

			if (firstCharOffset === -1) {
				firstCharOffset = start;
			}

			// balance
			balance[index] = balanceStart;

			if (type === balanceCloseType) {
				const prevBalanceStart = balance[balanceStart];

				// set reference to balance end for a block opener
				balance[balanceStart] = index;

				// pop state
				balanceStart = prevBalanceStart;
				// The root sentinel is not a token. A reused buffer can contain
				// stale data there, so never read a token type from that slot.
				balanceCloseType = prevBalanceStart === sourceLength
					? 0
					: balancePair[unpackTokenType(offsetAndType[prevBalanceStart])];
			} else if (this.isBlockOpenerTokenType(type)) { // check for FunctionToken, <(-token>, <[-token> and <{-token>
				// push state
				balanceStart = index;
				balanceCloseType = balancePair[type];
			}
		});

		// finalize buffers
		offsetAndType[tokenCount] = EOF * TYPE_FACTOR + sourceLength; // <EOF-token>
		balance[tokenCount] = tokenCount; // prevents false positive balance match with any token

		// reverse references from balance start to end
		// tokens
		//   token:   a ( [ b c ] d e ) {
		//   index:   0 1 2 3 4 5 6 7 8 9
		// before
		//   balance: 0 8 5 2 2 2 1 1 1 0
		//            - > > < < < < < < -
		// after
		//   balance: 9 8 5 5 5 2 8 8 1 9
		//            > > > > > < > > < >
		for (let i = 0; i < tokenCount; i++) {
			const balanceStart = balance[i];

			if (balanceStart <= i) {
				const balanceEnd = balance[balanceStart];

				if (balanceEnd !== i) {
					balance[i] = balanceEnd;
				}
			} else if (balanceStart > tokenCount) {
				balance[i] = tokenCount;
			}
		}

		// balance[0] = tokenCount;

		this.source = source;
		this.firstCharOffset = firstCharOffset === -1 ? 0 : firstCharOffset;
		this.tokenCount = tokenCount;
		this.offsetAndType = offsetAndType;
		this.balance = balance;

		this.reset();
		this.next();
	}

	lookupType(offset) {
		offset += this.tokenIndex;

		if (offset < this.tokenCount) {
			return unpackTokenType(this.offsetAndType[offset]);
		}

		return EOF;
	}
	lookupTypeNonSC(idx) {
		for (let offset = this.tokenIndex; offset < this.tokenCount; offset++) {
			const tokenType = unpackTokenType(this.offsetAndType[offset]);

			if (tokenType !== WhiteSpace && tokenType !== Comment) {
				if (idx-- === 0) {
					return tokenType;
				}
			}
		}

		return EOF;
	}
	lookupOffset(offset) {
		offset += this.tokenIndex;

		if (offset < this.tokenCount) {
			return unpackTokenOffset(this.offsetAndType[offset - 1]);
		}

		return this.source.length;
	}
	lookupOffsetNonSC(idx) {
		for (let offset = this.tokenIndex; offset < this.tokenCount; offset++) {
			const tokenType = unpackTokenType(this.offsetAndType[offset]);

			if (tokenType !== WhiteSpace && tokenType !== Comment) {
				if (idx-- === 0) {
					return offset - this.tokenIndex;
				}
			}
		}

		return EOF;
	}
	lookupValue(offset, referenceStr) {
		offset += this.tokenIndex;

		if (offset < this.tokenCount) {
			return cmpStr(
				this.source,
				unpackTokenOffset(this.offsetAndType[offset - 1]),
				unpackTokenOffset(this.offsetAndType[offset]),
				referenceStr
			);
		}

		return false;
	}
	getTokenStart(tokenIndex) {
		if (tokenIndex === this.tokenIndex) {
			return this.tokenStart;
		}

		if (tokenIndex > 0) {
			return tokenIndex < this.tokenCount
				? unpackTokenOffset(this.offsetAndType[tokenIndex - 1])
				: unpackTokenOffset(this.offsetAndType[this.tokenCount]);
		}

		return this.firstCharOffset;
	}
	getTokenEnd(tokenIndex) {
		if (tokenIndex === this.tokenIndex) {
			return this.tokenEnd;
		}

		return unpackTokenOffset(this.offsetAndType[boundIndex(tokenIndex, 0, this.tokenCount)]);
	}
	getTokenType(tokenIndex) {
		if (tokenIndex === this.tokenIndex) {
			return this.tokenType;
		}

		return unpackTokenType(this.offsetAndType[boundIndex(tokenIndex, 0, this.tokenCount)]);
	}
	substrToCursor(start) {
		return this.source.substring(start, this.tokenStart);
	}

	isBlockOpenerTokenType(tokenType) {
		return blockTokens[tokenType] === BLOCK_OPEN_TOKEN;
	}
	isBlockCloserTokenType(tokenType) {
		return blockTokens[tokenType] === BLOCK_CLOSE_TOKEN;
	}
	getBlockTokenPairIndex(tokenIndex) {
		const type = this.getTokenType(tokenIndex);

		if (blockTokens[type] === 1) {
			// block open token
			const pairIndex = this.balance[tokenIndex];
			const closeType = this.getTokenType(pairIndex);

			return balancePair[type] === closeType ? pairIndex : -1;
		} else if (blockTokens[type] === 2) {
			// block close token
			const pairIndex = this.balance[tokenIndex];
			const openType = this.getTokenType(pairIndex);

			return balancePair[openType] === type ? pairIndex : -1;
		}

		return -1;
	}
	isBalanceEdge(tokenIndex) {
		return this.balance[this.tokenIndex] < tokenIndex;
	}

	isDelim(code, offset) {
		if (offset) {
			return (
				this.lookupType(offset) === Delim &&
                this.source.charCodeAt(this.lookupOffset(offset)) === code
			);
		}

		return (
			this.tokenType === Delim &&
            this.source.charCodeAt(this.tokenStart) === code
		);
	}

	skip(tokenCount) {
		let next = this.tokenIndex + tokenCount;

		if (next < this.tokenCount) {
			this.tokenIndex = next;
			this.tokenStart = unpackTokenOffset(this.offsetAndType[next - 1]);
			next = this.offsetAndType[next];
			this.tokenType = unpackTokenType(next);
			this.tokenEnd = unpackTokenOffset(next);
		} else {
			this.tokenIndex = this.tokenCount;
			this.next();
		}
	}
	next() {
		let next = this.tokenIndex + 1;

		if (next < this.tokenCount) {
			this.tokenIndex = next;
			this.tokenStart = this.tokenEnd;
			next = this.offsetAndType[next];
			this.tokenType = unpackTokenType(next);
			this.tokenEnd = unpackTokenOffset(next);
		} else {
			this.eof = true;
			this.tokenIndex = this.tokenCount;
			this.tokenType = EOF;
			this.tokenStart = this.tokenEnd = this.source.length;
		}
	}
	skipSC() {
		while (this.tokenType === WhiteSpace || this.tokenType === Comment) {
			this.next();
		}
	}
	skipUntilBalanced(startToken, stopConsume) {
		let cursor = startToken;
		let balanceEnd;
		let offset;

		loop:
		for (; cursor < this.tokenCount; cursor++) {
			balanceEnd = this.balance[cursor];

			// stop scanning on balance edge that points to offset before start token
			if (balanceEnd < startToken) {
				break loop;
			}

			offset = cursor > 0 ? unpackTokenOffset(this.offsetAndType[cursor - 1]) : this.firstCharOffset;

			// check stop condition
			switch (stopConsume(this.source.charCodeAt(offset))) {
				case 1: // just stop
					break loop;

				case 2: // stop & included
					cursor++;
					break loop;

				default:
					// fast forward to the end of balanced block for an open block tokens
					if (this.isBlockOpenerTokenType(unpackTokenType(this.offsetAndType[cursor]))) {
						cursor = balanceEnd;
					}
			}
		}

		this.skip(cursor - this.tokenIndex);
	}

	forEachToken(fn) {
		for (let i = 0, offset = this.firstCharOffset; i < this.tokenCount; i++) {
			const start = offset;
			const item = this.offsetAndType[i];
			const end = unpackTokenOffset(item);
			const type = unpackTokenType(item);

			offset = end;

			fn(type, start, end, i);
		}
	}
	dump() {
		const tokens = new Array(this.tokenCount);

		this.forEachToken((type, start, end, index) => {
			tokens[index] = {
				idx: index,
				type: tokenNames[type],
				chunk: this.source.substring(start, end),
				balance: this.balance[index]
			};
		});

		return tokens;
	}
};
