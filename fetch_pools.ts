import {initCetusSDK, TickMath} from '@cetusprotocol/cetus-sui-clmm-sdk'
import {getSuiPrice} from './get_sui_price';
import * as fs from "fs"
import BN from 'bn.js';
import Decimal from 'decimal.js';

const sdk = initCetusSDK({network: 'mainnet'})


const [,, coinB, coinBName, suiPrice] = process.argv;

const coinA = '0x2::sui::SUI';
const coinAName = "SUI";

//const coinB = '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP';
//const coinBName = "DEEP";


async function fetchPoolData() {
    const pools = await sdk.Pool.getPoolByCoins([coinA, coinB])
    let allTickData: any[] = [];

    for (const pool of pools) {    
        const coinACfg = await sdk.CetusConfig.getCoinConfig(pool.coinTypeA);
        const coinBCfg = await sdk.CetusConfig.getCoinConfig(pool.coinTypeB);

        const {decimals: decimalsA, symbol: coinASymbol} = coinACfg;
        const {decimals: decimalsB, symbol: coinBSymbol} = coinBCfg;

        const currentPrice = TickMath.sqrtPriceX64ToPrice(new BN(pool.current_sqrt_price), decimalsA, decimalsB);
        //const usdPoolAmount = (pool.coinAmountA/Math.pow(10, decimalsA))* currentPrice + (pool.coinAmountB/Math.pow(10, decimalsB))

        const decimalsABN = new Decimal(10).pow(new Decimal(decimalsA));
        const decimalsBBN = new Decimal(10).pow(new Decimal(decimalsB));

        // Calculate scaled coin amounts
        const coinAmountABN = new Decimal(pool.coinAmountA);
        const coinAmountBBN = new Decimal(pool.coinAmountB);

        // Calculate pool value
        const usdPoolAmount = coinAmountABN.div(decimalsABN).mul(currentPrice).add(coinAmountBBN.div(decimalsBBN)).mul(suiPrice);

        console.log(`Fetched data for pool: ${pool.name} (${pool.poolAddress})`);

        allTickData.push({
            poolAddress: pool.poolAddress,
            poolType: pool.poolType,
            poolName: pool.name,
            poolNameUnique: `${coinASymbol}-${coinBSymbol}[${pool.tickSpacing}]`,
            coinTypeA: pool.coinTypeA,
            coinTypeB: pool.coinTypeB,
            coinAmountA: pool.coinAmountA,
            coinAmountB: pool.coinAmountB,
            current_sqrt_price: pool.current_sqrt_price,
            current_tick_index: pool.current_tick_index,
            fee_growth_global_a: pool.fee_growth_global_a,
            fee_growth_global_b: pool.fee_growth_global_b,
            fee_protocol_coin_a: pool.fee_protocol_coin_a,
            fee_protocol_coin_b: pool.fee_protocol_coin_b,
            fee_rate: pool.fee_rate,
            is_pause: pool.is_pause,
            liquidity: pool.liquidity,
            tickSpacing: pool.tickSpacing,
            currentTickIndex: pool.current_tick_index,
            currentPrice: TickMath.sqrtPriceX64ToPrice(new BN(pool.current_sqrt_price), decimalsA, decimalsB),
            currentSqrtPrice: pool.current_sqrt_price,
            usdPoolAmount: usdPoolAmount.toString()
        });
    }

    // Format: tick_data_PAIR_YYYY_MM_DD_HH_MM_SS.json
    const currentTime = new Date().toISOString().replace(/[-:]/g, '_').split('.')[0].replace('T', '_');
    const pair = `${coinAName}-${coinBName}`;
    const fileName = `pools/pools_${pair}_${currentTime}.json`;

    if (allTickData.length > 0) {
        fs.writeFileSync(fileName, JSON.stringify(allTickData, null, 2));
        console.log(`✅ Pool data saved to ${fileName}.json`);
      } else {
        console.log(`⚠️ No data available for ${pair}. File not saved.`);
      }
}

fetchPoolData();