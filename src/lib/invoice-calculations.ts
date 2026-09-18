// Decimal arithmetic shared by the form and validation. PostgreSQL numeric uses
// the same half-away-from-zero rounding; no binary floating-point products.
function decimalScaled(value:number|string,scale:number):bigint {
 const match=String(value).match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
 if(!match)throw new Error("Numero decimale non valido");
 const fraction=match[3]??"",exponent=Number(match[4]??0)-fraction.length+scale;
 const digits=BigInt(match[2]+fraction)*(match[1]==="-"?BigInt(-1):BigInt(1));
 return exponent>=0?digits*BigInt(10)**BigInt(exponent):roundDivide(digits,BigInt(10)**BigInt(-exponent));
}
function roundDivide(value:bigint,divisor:bigint):bigint {
 const sign=value<BigInt(0)?BigInt(-1):BigInt(1);
 const magnitude=value*sign;
 return sign*((magnitude+divisor/BigInt(2))/divisor);
}
export function decimalCents(value:number|string){return Number(decimalScaled(value,2));}
export function invoiceLineAmounts(line:{quantity:number|string;unit_price:number|string;discount?:number|string;vat_rate?:number|string|null;vat_exempt_reason?:string|null}){
 const quantity=decimalScaled(line.quantity,3),price=decimalScaled(line.unit_price,4),discount=decimalScaled(line.discount??0,4);
 const net=roundDivide(quantity*price*(BigInt(1000000)-discount),BigInt(100000000000));
 const vat=line.vat_exempt_reason?BigInt(0):roundDivide(net*decimalScaled(line.vat_rate??0,2),BigInt(10000));
 return {net:Number(net)/100,vat:Number(vat)/100,total:Number(net+vat)/100};
}
export function invoiceHeaderVat(net:number|string,rate:number|string){return Number(roundDivide(decimalScaled(net,2)*decimalScaled(rate,2),BigInt(10000)))/100;}
export function sumMoney(values:number[]){return values.reduce((sum,value)=>sum+decimalCents(value),0)/100;}
