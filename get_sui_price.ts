import axios from "axios";
import BN from "bn.js";
import Decimal from "decimal.js";

export async function getSuiPrice(): Promise<number> {
    try {
        const response = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
            params: {
                ids: "sui",
                vs_currencies: "usd",
            },
        });

        return response.data.sui.usd;
    } catch (error) {
        console.error("Error fetching SUI price:", error);
        return 0;
    }
}

export function convertToUSD(amount: BN, suiUsdPrice: number, coinDecimals: number, coinSymbol: string, coinSuiPrice: Decimal): Decimal {
    return coinSymbol === 'SUI'
        ? new Decimal(amount.toString()).div(new Decimal(10).pow(new Decimal(coinDecimals))).mul(suiUsdPrice)
        : new Decimal(amount.toString()).div(new Decimal(10).pow(new Decimal(coinDecimals))).mul(suiUsdPrice).mul(coinSuiPrice);
}
