import BN from 'bn.js';
import Decimal from 'decimal.js';
import {TickMath, ClmmPoolUtil, Pool, TickData} from '@cetusprotocol/cetus-sui-clmm-sdk';
import {convertToUSD} from "./get_sui_price";

type TickDataExtended = TickData & AmountExtension;

type AmountExtension = {
    price: Decimal;
    accumulatedLiquidity: BN;
    rawLiquidityNet: BN;
    accumulatedAmountA: BN;
    accumulatedAmountB: BN;
    accumulatedUsdAmountA: Decimal;
    accumulatedUsdAmountB: Decimal;
    accumulatedUsdAmount: Decimal;
    amountA: BN;
    amountB: BN;
    usdAmountA: Decimal;
    usdAmountB: Decimal;
    usdAmount: Decimal;
}

export function calculateLiquidityDepth(ticksInit: TickData[],
                                        currentSqrtPrice: BN,
                                        symbolA: string,
                                        symbolB: string,
                                        decimalsA: number,
                                        decimalsB: number,
                                        suiPrice: number
): {
    extended: TickDataExtended[],
    totalLiquidity: AmountExtension,
} {
    let accumulatedAmountA = new BN(0);
    let accumulatedAmountB = new BN(0);
    let accumulatedUsdAmountA = new Decimal(0);
    let accumulatedUsdAmountB = new Decimal(0);
    let ticks: TickDataExtended[] = ticksInit.map(tick => ({
        ...tick,
        price: TickMath.sqrtPriceX64ToPrice(tick.sqrtPrice, decimalsA, decimalsB),
        accumulatedLiquidity: new BN(0),
        rawLiquidityNet: tick.liquidityNet,
        accumulatedAmountA: new BN(0),
        accumulatedAmountB: new BN(0),
        accumulatedUsdAmountA: new Decimal(0),
        accumulatedUsdAmountB: new Decimal(0),
        accumulatedUsdAmount: new Decimal(0),
        amountA: new BN(0),
        amountB: new BN(0),
        usdAmountA: new Decimal(0),
        usdAmountB: new Decimal(0),
        usdAmount: new Decimal(0),
    }));

    const two128 = new BN(2).pow(new BN(128))
    for (let i = 0; i < ticks.length; i++) {
        if (ticks[i].liquidityNet.gt(ticks[i].liquidityGross)) {
            ticks[i].liquidityNet = ticks[i].liquidityNet.sub(two128);
        }
        if (i === 0) {
            ticks[i].accumulatedLiquidity = ticksInit[i].liquidityNet;
        } else {
            ticks[i].accumulatedLiquidity = ticks[i - 1].accumulatedLiquidity?.add(ticks[i].liquidityNet);
        }
    }

    const currentPrice = TickMath.sqrtPriceX64ToPrice(currentSqrtPrice, decimalsA, decimalsB);

    for (let i = 0; i < ticks.length - 1; i++) {
        const amounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
            ticks[i].accumulatedLiquidity,
            currentSqrtPrice,
            ticks[i].sqrtPrice,
            ticks[i + 1].sqrtPrice,
            false
        );

        const usdAmountA = convertToUSD(amounts.coinA, suiPrice, decimalsA, symbolA, currentPrice);
        const usdAmountB = convertToUSD(amounts.coinB, suiPrice, decimalsB, symbolB, currentPrice);

        accumulatedAmountA = accumulatedAmountA.add(amounts.coinA);
        accumulatedAmountB = accumulatedAmountB.add(amounts.coinB);
        accumulatedUsdAmountA = accumulatedUsdAmountA.add(usdAmountA);
        accumulatedUsdAmountB = accumulatedUsdAmountB.add(usdAmountB);

        ticks[i].amountA = amounts.coinA;
        ticks[i].amountB = amounts.coinB;
        ticks[i].usdAmountA = usdAmountA;
        ticks[i].usdAmountB = usdAmountB;
        ticks[i].usdAmount = usdAmountA.add(usdAmountB);
        ticks[i].accumulatedAmountA = accumulatedAmountA;
        ticks[i].accumulatedAmountB = accumulatedAmountB;
        ticks[i].accumulatedUsdAmountA = accumulatedUsdAmountA;
        ticks[i].accumulatedUsdAmountB = accumulatedUsdAmountB;
        ticks[i].accumulatedUsdAmount = accumulatedUsdAmountA.add(accumulatedUsdAmountB);
    }

    const totalLiq: AmountExtension = {
        price: currentPrice,
        rawLiquidityNet: ticks[ticks.length - 1].rawLiquidityNet,
        accumulatedLiquidity: ticks[ticks.length - 1].accumulatedLiquidity,
        accumulatedAmountA: accumulatedAmountA,
        accumulatedAmountB: accumulatedAmountB,
        accumulatedUsdAmountA: accumulatedUsdAmountA,
        accumulatedUsdAmountB: accumulatedUsdAmountB,
        accumulatedUsdAmount: accumulatedUsdAmountA.add(accumulatedUsdAmountB),
        amountA: accumulatedAmountA,
        amountB: accumulatedAmountB,
        usdAmountA: accumulatedUsdAmountA,
        usdAmountB: accumulatedUsdAmountB,
        usdAmount: accumulatedUsdAmountA.add(accumulatedUsdAmountB),
    }

    return {extended: ticks, totalLiquidity: totalLiq};
}
