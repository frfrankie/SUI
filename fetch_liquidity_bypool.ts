import {CalculateRatesResult, initCetusSDK, Pool, TickData, TickMath} from '@cetusprotocol/cetus-sui-clmm-sdk';
import {findSlippageThreshold} from './price_impact';
import {getSuiPrice} from './get_sui_price';
import {calculateLiquidityDepth} from './liquidity';
import * as fs from 'fs';
import BN from 'bn.js';
import Decimal from "decimal.js";

const sdk = initCetusSDK({network: 'mainnet'});

const coinA = '0x2::sui::SUI';
const coinAName = 'SUI';

//const [,, coinB, coinBName, suiPrice] = process.argv;
const [,, poolAddress, suiPrice] = process.argv;

const suiPriceN = Number(suiPrice)
const A2B = true;
const B2A = false;
const slippageThresholds = [0.5, 2];

//deepSUI-200_2025....json

async function fetchTickData(poolAddress: string): Promise<void> {
    try {
        // Fetch the pool using its address
        const pool = await sdk.Pool.getPool(poolAddress);

        const [coinACfg, coinBCfg] = await Promise.all([
            sdk.CetusConfig.getCoinConfig(pool.coinTypeA),
            sdk.CetusConfig.getCoinConfig(pool.coinTypeB)
        ]);
    
        const {decimals: decimalsA, symbol: coinASymbol} = coinACfg;
        const {decimals: decimalsB, symbol: coinBSymbol} = coinBCfg;

        // Fetch tick data for the pool
        const tickData = await fetchPoolTickData(pool, suiPriceN, decimalsA, decimalsB, coinASymbol, coinBSymbol);

        // Prepare the filename with timestamp
        const currentTime = new Date().toISOString().replace(/[-:]/g, '_').split('.')[0].replace('T', '_');
        
        const fileName = `ticks/${coinASymbol}-${coinBSymbol}[${pool.tickSpacing}]_${currentTime}.json`;

        // Save the tick data to a file
        fs.writeFileSync(fileName, JSON.stringify(tickData, null, 2));
        console.log(`✅ Tick data saved to ${fileName}`);
    } catch (error) {
        console.error('Error fetching tick data:', error);
    }
}

async function fetchPoolTickData(pool: Pool, suiPriceN: number, decimalsA: number, decimalsB: number, coinASymbol: string, coinBSymbol: string): Promise<any> {
    const ticks = await sdk.Pool.fetchTicks({
        pool_id: pool.poolAddress,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
    });

    // if (ticks.length <= 10) {
    //     console.log(`Too few ticks for pool: ${pool.name} (${pool.poolAddress})`);
    //     return null;
    // }

    const currentPrice = TickMath.sqrtPriceX64ToPrice(new BN(pool.current_sqrt_price), decimalsA, decimalsB);

    const priceImpacts = calculatePriceImpacts(ticks, pool, decimalsA, decimalsB, coinASymbol, coinBSymbol, suiPriceN, currentPrice);

    const result = calculateLiquidityDepth(ticks, new BN(pool.current_sqrt_price), coinASymbol, coinBSymbol, decimalsA, decimalsB, suiPriceN);
    const total = result.totalLiquidity
    const extendedTicks = result.extended;

    console.log(`Fetched ticks for pool: ${pool.name} (${pool.poolAddress})`);

    return {
        poolName: pool.name,
        poolAddress: pool.poolAddress,
        feeTier: pool.fee_rate,
        tickSpacing: pool.tickSpacing,
        currentTickIndex: pool.current_tick_index,
        currentSqrtPrice: pool.current_sqrt_price,
        currentPrice: currentPrice.toString(),
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
        symbolA: coinASymbol,
        symbolB: coinBSymbol,
        decimalsA: decimalsA,
        decimalsB: decimalsB,
        liquidity: pool.liquidity,
        coinAmountA: pool.coinAmountA,
        coinAmountB: pool.coinAmountB,
        accumulatedAmountA: total.accumulatedAmountA.toString(),
        accumulatedAmountB: total.accumulatedAmountB.toString(),
        accumulatedUsdAmountA: total.accumulatedUsdAmountA.toString(),
        accumulatedUsdAmountB: total.accumulatedUsdAmountB.toString(),
        usdAmount: total.usdAmount.toString(),
        priceImpacts: priceImpacts,
        ticks: extendedTicks.map(tick => ({
            index: tick.index,
            sqrtPrice: tick.sqrtPrice.toString(),
            price: TickMath.sqrtPriceX64ToPrice(new BN(tick.sqrtPrice), decimalsA, decimalsB),
            rawLiquidityNet: tick.rawLiquidityNet.toString(),
            liquidityNet: tick.liquidityNet.toString(),
            liquidityGross: tick.liquidityGross.toString(),
            amountA: tick.amountA.toString(),
            amountB: tick.amountB.toString(),
            usdAmountA: tick.usdAmountA.toString(),
            usdAmountB: tick.usdAmountB.toString(),
            usdAmount: tick.usdAmount.toString(),
            accumulatedLiquidity: tick.accumulatedLiquidity.toString(),
            accumulatedAmountA: tick.accumulatedAmountA.toString(),
            accumulatedAmountB: tick.accumulatedAmountB.toString(),
            accumulatedUsdAmountA: tick.accumulatedUsdAmountA.toString(),
            accumulatedUsdAmountB: tick.accumulatedUsdAmountB.toString(),
            accumulatedUsdAmount: tick.accumulatedUsdAmount.toString(),
            feeGrowthOutsideA: tick.feeGrowthOutsideA.toString(),
            feeGrowthOutsideB: tick.feeGrowthOutsideB.toString(),
            rewardersGrowthOutside: tick.rewardersGrowthOutside.map(val => val.toString()),
        }))
    };
}

function calculatePriceImpacts(ticks: TickData[], pool: Pool, decimalsA: number, decimalsB: number, coinASymbol: string, coinBSymbol: string, suiPrice: number, currentPrice: Decimal): any[] {
    const priceImpacts = [];

    for (const slippageThreshold of slippageThresholds) {
        const a2b = findSlippageThreshold(slippageThreshold, A2B, ticks, pool, decimalsA, decimalsB, coinASymbol, coinBSymbol, suiPrice, currentPrice);
        const b2a = findSlippageThreshold(slippageThreshold, B2A, ticks, pool, decimalsB, decimalsA, coinBSymbol, coinASymbol, suiPrice, currentPrice);
        if (a2b && b2a) {

            priceImpacts.push({
                priceImpact: slippageThreshold,
                a2b: {
                    ...a2b,
                    estimatedAmountIn: a2b.estimatedAmountIn.toString(),
                    estimatedAmountOut: a2b.estimatedAmountOut.toString(),
                    amount: a2b.amount.toString(),
                    estimatedEndPrice: TickMath.sqrtPriceX64ToPrice(a2b.estimatedEndSqrtPrice, decimalsA, decimalsB), // rewrite this line to use correct decimals
                    estimatedEndSqrtPrice: a2b.estimatedEndSqrtPrice.toString(),
                    estimatedFeeAmount: a2b.estimatedFeeAmount.toString(),
                },
                b2a: {
                    ...b2a,
                    estimatedAmountIn: b2a.estimatedAmountIn.toString(),
                    estimatedAmountOut: b2a.estimatedAmountOut.toString(),
                    amount: b2a.amount.toString(),
                    estimatedEndPrice: TickMath.sqrtPriceX64ToPrice(b2a.estimatedEndSqrtPrice, decimalsA, decimalsB), // rewrite this line to use correct decimals
                    estimatedEndSqrtPrice: b2a.estimatedEndSqrtPrice.toString(),
                    estimatedFeeAmount: b2a.estimatedFeeAmount.toString(),
                },
            });
        }
    }
    return priceImpacts;
}

fetchTickData(poolAddress);