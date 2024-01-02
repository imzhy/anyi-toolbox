/**
 * mozilla 实现
 * https://github.com/ehsan/mozilla-history/blob/master/content/smil/nsSMILKeySpline.cpp
 *
 * 其它版本实现
 * https://github.com/gre/bezier-easing
 * https://github.com/juliangarnier/anime/blob/master/lib/anime.js
 *
 * bezier 速查
 * https://cubic-bezier.com
 *
 * 常用缓动函数
 * https://easings.net
 */

const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 0.0_000_001;
const SUBDIVISION_MAX_ITERATIONS = 10;

const kSplineTableSize = 11;
const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

function A(aA1, aA2) {
    return 1.0 - 3.0 * aA2 + 3.0 * aA1;
}

function B(aA1, aA2) {
    return 3.0 * aA2 - 6.0 * aA1;
}

function C(aA1) {
    return 3.0 * aA1;
}

function calcBezier(aT, aA1, aA2) {
    return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT;
}

function getSlope(aT, aA1, aA2) {
    return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1);
}

function binarySubdivide(aX, aA, aB, mX1, mX2) {
    let currentX, currentT, i = 0;
    do {
        currentT = aA + (aB - aA) / 2.0;
        currentX = calcBezier(currentT, mX1, mX2) - aX;
        if (currentX > 0.0) {
            aB = currentT;
        } else {
            aA = currentT;
        }
    } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
    return currentT;
}

function newtonRaphsonIterate(aX, aGuessT, mX1, mX2) {
    for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
        let currentSlope = getSlope(aGuessT, mX1, mX2);
        if (currentSlope === 0.0) {
            return aGuessT;
        }
        let currentX = calcBezier(aGuessT, mX1, mX2) - aX;
        aGuessT -= currentX / currentSlope;
    }
    return aGuessT;
}

function getTForX(aX, mX1, mX2, sampleValues) {
    let intervalStart = 0.0;
    let currentSample = 1;
    let lastSample = kSplineTableSize - 1;

    for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
        intervalStart += kSampleStepSize;
    }
    --currentSample;

    let dist = (aX - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    let guessForT = intervalStart + dist * kSampleStepSize;

    let initialSlope = getSlope(guessForT, mX1, mX2);
    if (initialSlope >= NEWTON_MIN_SLOPE) {
        return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
    } else if (initialSlope === 0.0) {
        return guessForT;
    } else {
        return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
    }
}

export class Bezier {
    mX1 = null;
    mY1 = null;
    mX2 = null;
    mY2 = null;
    sampleValues = null;

    constructor(mX1, mY1, mX2, mY2) {
        if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) {
            throw new Error("bezier x values must be in [0, 1] range");
        }

        this.mX1 = mX1;
        this.mY1 = mY1;
        this.mX2 = mX2;
        this.mY2 = mY2;

        this.sampleValues = new Float32Array(kSplineTableSize);
        for (let i = 0; i < kSplineTableSize; ++i) {
            this.sampleValues[i] = calcBezier(i * kSampleStepSize, this.mX1, this.mX2);
        }
    }

    easing = (x) => {
        if (this.mX1 === this.mY1 && this.mX2 === this.mY2) return x;
        if (x === 0 || x === 1) return x;
        return calcBezier(getTForX(x, this.mX1, this.mX2, this.sampleValues), this.mY1, this.mY2);
    }
}