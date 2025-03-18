import {CalculateRatesResult, initCetusSDK, Pool, TickData, TickMath,} from '@cetusprotocol/cetus-sui-clmm-sdk';
import BN from 'bn.js';
import Decimal from "decimal.js";
import {convertToUSD} from "./get_sui_price";

const sdk = initCetusSDK({network: 'mainnet'});

type RateResultExtended = CalculateRatesResult & {
    symbolIn: string,
    symbolOut: string,
    decimalsIn: number,
    decimalsOut: number,
    usdAmountIn: Decimal,
    usdAmountOut: Decimal,
    estimatedEndIndex: number,
}

export function findSlippageThreshold(
    targetSlippagePct: number = 0.5,
    a2b: boolean = false,
    swapTicks: TickData[],
    pool: Pool,
    decimalsA: number,
    decimalsB: number,
    coinAName: string,
    coinBName: string,
    suiPrice: number,
    currentPrice: Decimal,
): RateResultExtended | null {
    let low = (10 ** decimalsA);
    let high = 10_000_000 * (10 ** decimalsA);
    let preSwapResult: CalculateRatesResult | null = null;
    let i = 0

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);

        const res = sdk.Swap.calculateRates({
            decimalsA,
            decimalsB,
            a2b: a2b, // true = A -> B, false = B -> A
            byAmountIn: true,
            amount: new BN(mid),
            swapTicks,
            currentPool: pool,
        });

        if (res.priceImpactPct >= targetSlippagePct) {
            preSwapResult = res;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
        i++;
    }

    if (preSwapResult) {
        console.log(`\n✅ Trade size that reaches ${preSwapResult.priceImpactPct.toFixed(8)}% slippage on the following IN size:
    → Amount In   : ${preSwapResult.estimatedAmountIn.toNumber() / 10 ** decimalsA} ${coinAName} 
    → Amount Out  : ${preSwapResult.estimatedAmountOut.toNumber() / 10 ** decimalsB} ${coinBName}
    `);

        return {
            ...preSwapResult,
            symbolIn: coinAName,
            symbolOut: coinBName,
            decimalsIn: decimalsA,
            decimalsOut: decimalsB,
            usdAmountIn: convertToUSD(preSwapResult.estimatedAmountIn, suiPrice, decimalsA, coinAName, currentPrice),
            usdAmountOut: convertToUSD(preSwapResult.estimatedAmountOut, suiPrice, decimalsB, coinBName, currentPrice),
            estimatedEndIndex: TickMath.sqrtPriceX64ToTickIndex(preSwapResult.estimatedEndSqrtPrice),
        }
    } else {
        console.log("Could not find a trade size that meets the slippage requirement within the tested range.");
        return null;
    }
}
