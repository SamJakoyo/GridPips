function sanitizeMqlString(val: string): string {
  return val.replace(/["\\\r\n]/g, '').trim();
}

export function buildSilverBulletEa(bridgeUrl: string, bridgeToken: string): string {
  const safeUrl = sanitizeMqlString(bridgeUrl) || 'https://grid-pips.vercel.app/api/ea/mt5/heartbeat';
  const safeToken = sanitizeMqlString(bridgeToken) || 'PASTE_YOUR_BRIDGE_TOKEN_HERE';

  return `//+------------------------------------------------------------------+
//|                                GRIDPIPs_ICT_SilverBullet_EA.mq5   |
//|                        Copyright 2026, GRIDPIPs Automation Labs   |
//|                                   https://t.me/JakoyoFx          |
//+------------------------------------------------------------------+
#property copyright "GRIDPIPs Automation Labs"
#property link      "https://t.me/JakoyoFx"
#property version   "1.10"
#property strict

#include <Trade\\Trade.mqh>
CTrade trade;

//--- Input Parameters
input group "=== ICT Session & Strategy Settings ==="
input int      InpMagicNumber      = 20260525; // Unique EA Magic Number
input double   InpRiskPercent      = 1.0;      // Risk per trade (% of Balance)
input double   InpMinFvgPips       = 4.0;      // Minimum FVG size in pips
input double   InpRewardRiskRatio  = 2.5;      // Target Risk-to-Reward (1:X)
input bool     InpUseLondonKZ      = true;     // Trade London Killzone (07:00-10:00 Server)
input bool     InpUseNewYorkKZ     = true;     // Trade NY Silver Bullet (15:00-17:00 Server)
input int      InpMaxDailyTrades   = 3;        // Maximum trades per day
input double   InpMaxDailyLossPct  = 3.0;      // Daily Equity Drawdown Stop (%)

input group "=== GRIDPIPs MT5 Bridge Sync (Pre-Configured) ==="
input bool     InpEnableWebBridge  = true;     // Sync live telemetry to GRIDPIPs Dashboard
input string   InpBridgeUrl        = "${safeUrl}";
input string   InpBridgeToken      = "${safeToken}";

datetime lastBarTime = 0;
datetime lastSyncTime = 0;
int dailyTradeCount = 0;
int lastDayOfYear = -1;
double dayStartBalance = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(20);
   dayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   MqlDateTime dt;
   TimeCurrent(dt);
   lastDayOfYear = dt.day_of_year;
   Print("GRIDPIPs ICT Silver Bullet EA initialized on ", _Symbol);
   SyncWithGRIDPIPsBridge("ONLINE");
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   SyncWithGRIDPIPsBridge("OFFLINE");
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   MqlDateTime dt;
   TimeCurrent(dt);

   // Reset daily counters at midnight
   if(dt.day_of_year != lastDayOfYear)
   {
      lastDayOfYear = dt.day_of_year;
      dailyTradeCount = 0;
      dayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   }

   // Periodic MT5 Bridge heartbeat every 30 seconds
   if(InpEnableWebBridge && TimeCurrent() - lastSyncTime >= 30)
   {
      SyncWithGRIDPIPsBridge("ACTIVE");
      lastSyncTime = TimeCurrent();
   }

   // Daily Drawdown Protection
   double currentEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   double maxLossUsd = dayStartBalance * (InpMaxDailyLossPct / 100.0);
   if(dayStartBalance - currentEquity >= maxLossUsd)
   {
      return;
   }

   // Evaluate only on new closed candle
   datetime currentBar = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(currentBar == lastBarTime) return;
   lastBarTime = currentBar;

   if(dailyTradeCount >= InpMaxDailyTrades) return;
   if(!IsInsideKillzone(dt.hour)) return;
   if(HasOpenPosition()) return;

   double pipSize = GetPipSize();
   double fvgMinDist = InpMinFvgPips * pipSize;

   // Read last 4 closed bars for ICT Fair Value Gap (3-candle displacement)
   double high1 = iHigh(_Symbol, PERIOD_CURRENT, 1);
   double low1  = iLow(_Symbol, PERIOD_CURRENT, 1);
   double close1 = iClose(_Symbol, PERIOD_CURRENT, 1);
   double open1  = iOpen(_Symbol, PERIOD_CURRENT, 1);

   double high2 = iHigh(_Symbol, PERIOD_CURRENT, 2);
   double low2  = iLow(_Symbol, PERIOD_CURRENT, 2);
   double close2 = iClose(_Symbol, PERIOD_CURRENT, 2);
   double open2  = iOpen(_Symbol, PERIOD_CURRENT, 2);

   double high3 = iHigh(_Symbol, PERIOD_CURRENT, 3);
   double low3  = iLow(_Symbol, PERIOD_CURRENT, 3);

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   // Bullish BISI Fair Value Gap: candle 1 low > candle 3 high + bullish displacement
   if(low1 > high3 && (low1 - high3) >= fvgMinDist && close2 > open2 && close1 > open1)
   {
      double sl = NormalizeDouble(low2 - (3.0 * pipSize), _Digits);
      double slDist = ask - sl;
      if(slDist > 0)
      {
         double tp = NormalizeDouble(ask + (slDist * InpRewardRiskRatio), _Digits);
         double lots = CalculateLotSize(slDist);
         if(trade.Buy(lots, _Symbol, ask, sl, tp, "GRIDPIPs ICT Bullish FVG"))
         {
            dailyTradeCount++;
            SyncWithGRIDPIPsBridge("BUY_EXECUTED");
         }
      }
   }
   // Bearish SIBI Fair Value Gap: candle 1 high < candle 3 low + bearish displacement
   else if(high1 < low3 && (low3 - high1) >= fvgMinDist && close2 < open2 && close1 < open1)
   {
      double sl = NormalizeDouble(high2 + (3.0 * pipSize), _Digits);
      double slDist = sl - bid;
      if(slDist > 0)
      {
         double tp = NormalizeDouble(bid - (slDist * InpRewardRiskRatio), _Digits);
         double lots = CalculateLotSize(slDist);
         if(trade.Sell(lots, _Symbol, bid, sl, tp, "GRIDPIPs ICT Bearish FVG"))
         {
            dailyTradeCount++;
            SyncWithGRIDPIPsBridge("SELL_EXECUTED");
         }
      }
   }
}

bool IsInsideKillzone(int hour)
{
   bool inLondon = InpUseLondonKZ && (hour >= 7 && hour <= 10);
   bool inNY     = InpUseNewYorkKZ && (hour >= 15 && hour <= 18);
   return (inLondon || inNY);
}

int CountOpenEaPositions()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionGetTicket(i) > 0)
      {
         if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
            PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
            count++;
      }
   }
   return count;
}

bool HasOpenPosition()
{
   return CountOpenEaPositions() > 0;
}

double GetPipSize()
{
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   if(digits == 3 || digits == 5) return _Point * 10.0;
   return _Point;
}

double CalculateLotSize(double slDistancePrice)
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskMoney = balance * (InpRiskPercent / 100.0);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double lotStep   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minLot    = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot    = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);

   if(tickValue <= 0 || tickSize <= 0 || slDistancePrice <= 0) return minLot;

   double slTicks = slDistancePrice / tickSize;
   double rawLots = riskMoney / (slTicks * tickValue);
   double stepped = MathFloor(rawLots / lotStep) * lotStep;
   return MathMax(minLot, MathMin(maxLot, NormalizeDouble(stepped, 2)));
}

string ExtractJsonValue(string json, string key)
{
   string needle = "\\"" + key + "\\":";
   int pos = StringFind(json, needle);
   if(pos < 0) return "";
   int start = pos + StringLen(needle);
   while(start < StringLen(json) && (StringGetCharacter(json, start) == ' ' || StringGetCharacter(json, start) == '\\t')) start++;
   if(start >= StringLen(json)) return "";
   if(StringGetCharacter(json, start) == '"')
   {
      start++;
      int endQ = StringFind(json, "\\"", start);
      if(endQ < 0) return "";
      return StringSubstr(json, start, endQ - start);
   }
   int endC = StringFind(json, ",", start);
   int endB = StringFind(json, "}", start);
   int endIdx = (endC >= 0 && (endB < 0 || endC < endB)) ? endC : endB;
   if(endIdx < 0) endIdx = StringLen(json);
   return StringSubstr(json, start, endIdx - start);
}

void ExecuteRemoteCommandIfPresent(string responseBody)
{
   if(StringFind(responseBody, "\\"autoTradeEnabled\\":true") < 0) return;
   string cmdIdStr = ExtractJsonValue(responseBody, "cmdId");
   long cmdId = StringToInteger(cmdIdStr);
   if(cmdId <= 0) return;

   string cmdSym  = ExtractJsonValue(responseBody, "cmdSymbol");
   string cmdSide = ExtractJsonValue(responseBody, "cmdSide");
   double cmdVol  = StringToDouble(ExtractJsonValue(responseBody, "cmdVol"));
   double cmdSl   = StringToDouble(ExtractJsonValue(responseBody, "cmdSl"));
   double cmdTp   = StringToDouble(ExtractJsonValue(responseBody, "cmdTp"));

   if(StringLen(cmdSym) < 3) cmdSym = _Symbol;
   if(cmdVol <= 0) cmdVol = SymbolInfoDouble(cmdSym, SYMBOL_VOLUME_MIN);
   SymbolSelect(cmdSym, true);

   int symDigits = (int)SymbolInfoInteger(cmdSym, SYMBOL_DIGITS);
   double sl = (cmdSl > 0) ? NormalizeDouble(cmdSl, symDigits) : 0;
   double tp = (cmdTp > 0) ? NormalizeDouble(cmdTp, symDigits) : 0;
   bool ok = false;

   if(cmdSide == "BUY")
      ok = trade.Buy(cmdVol, cmdSym, SymbolInfoDouble(cmdSym, SYMBOL_ASK), sl, tp, "GRIDPIPs Auto-Trade");
   else if(cmdSide == "SELL")
      ok = trade.Sell(cmdVol, cmdSym, SymbolInfoDouble(cmdSym, SYMBOL_BID), sl, tp, "GRIDPIPs Auto-Trade");

   if(ok)
      AcknowledgeCommandExecution(cmdId, "EXECUTED");
   else
      AcknowledgeCommandExecution(cmdId, "FAILED");
}

void AcknowledgeCommandExecution(long cmdId, string cmdStatus)
{
   string headers = "Content-Type: application/json\\r\\n";
   string payload = StringFormat(
      "{\\"token\\":\\"%s\\",\\"login\\":\\"%I64d\\",\\"server\\":\\"%s\\",\\"symbol\\":\\"%s\\",\\"balance\\":%.2f,\\"equity\\":%.2f,\\"openPositions\\":%d,\\"eaName\\":\\"ICT Silver Bullet EA\\",\\"status\\":\\"CMD_%s\\",\\"executedCmdId\\":%I64d}",
      InpBridgeToken,
      AccountInfoInteger(ACCOUNT_LOGIN),
      AccountInfoString(ACCOUNT_SERVER),
      _Symbol,
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      CountOpenEaPositions(),
      cmdStatus,
      cmdId
   );
   char post[], result[];
   StringToCharArray(payload, post, 0, StringLen(payload));
   string resHeaders;
   WebRequest("POST", InpBridgeUrl, headers, 4000, post, result, resHeaders);
}

void SyncWithGRIDPIPsBridge(string eventStatus)
{
   if(!InpEnableWebBridge || StringLen(InpBridgeToken) < 8) return;
   string headers = "Content-Type: application/json\\r\\n";
   string payload = StringFormat(
      "{\\"token\\":\\"%s\\",\\"login\\":\\"%I64d\\",\\"server\\":\\"%s\\",\\"symbol\\":\\"%s\\",\\"balance\\":%.2f,\\"equity\\":%.2f,\\"openPositions\\":%d,\\"eaName\\":\\"ICT Silver Bullet EA\\",\\"status\\":\\"%s\\"}",
      InpBridgeToken,
      AccountInfoInteger(ACCOUNT_LOGIN),
      AccountInfoString(ACCOUNT_SERVER),
      _Symbol,
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      CountOpenEaPositions(),
      eventStatus
   );
   char post[], result[];
   StringToCharArray(payload, post, 0, StringLen(payload));
   string resHeaders;
   ResetLastError();
   int code = WebRequest("POST", InpBridgeUrl, headers, 4000, post, result, resHeaders);
   if(code == -1)
   {
      int err = GetLastError();
      if(err == 4014)
         Print("GRIDPIPs Bridge: Whitelist ", InpBridgeUrl, " under MT5 Tools -> Options -> Expert Advisors -> Allow WebRequest.");
      else
         Print("GRIDPIPs Bridge error code: ", err);
      return;
   }
   string body = CharArrayToString(result);
   ExecuteRemoteCommandIfPresent(body);
}
`;
}

export function buildSmcOrderBlockEa(bridgeUrl: string, bridgeToken: string): string {
  const safeUrl = sanitizeMqlString(bridgeUrl) || 'https://grid-pips.vercel.app/api/ea/mt5/heartbeat';
  const safeToken = sanitizeMqlString(bridgeToken) || 'PASTE_YOUR_BRIDGE_TOKEN_HERE';

  return `//+------------------------------------------------------------------+
//|                                GRIDPIPs_SMC_OrderBlock_EA.mq5     |
//|                        Copyright 2026, GRIDPIPs Automation Labs   |
//|                                   https://t.me/JakoyoFx          |
//+------------------------------------------------------------------+
#property copyright "GRIDPIPs Automation Labs"
#property link      "https://t.me/JakoyoFx"
#property version   "1.10"
#property strict

#include <Trade\\Trade.mqh>
CTrade trade;

input group "=== SMC Order Block & Liquidity Sweep ==="
input int      InpMagicNumber     = 20260999; // Magic Number
input double   InpRiskPercent     = 1.0;      // Risk % per trade
input int      InpSwingLookback   = 12;       // Swing High/Low lookback bars
input double   InpRewardRisk      = 3.0;      // Target R:R Ratio
input bool     InpMoveToBreakEven = true;     // Move SL to BreakEven at 1:1.5 R:R

input group "=== GRIDPIPs MT5 Bridge Sync (Pre-Configured) ==="
input bool     InpEnableWebBridge = true;     // Sync live telemetry to GRIDPIPs Dashboard
input string   InpBridgeUrl       = "${safeUrl}";
input string   InpBridgeToken     = "${safeToken}";

datetime lastBar = 0;
datetime lastSyncTime = 0;

int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(20);
   Print("GRIDPIPs SMC Order Block EA started on ", _Symbol);
   SyncWithGRIDPIPsBridge("ONLINE");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   SyncWithGRIDPIPsBridge("OFFLINE");
}

void OnTick()
{
   if(InpEnableWebBridge && TimeCurrent() - lastSyncTime >= 30)
   {
      SyncWithGRIDPIPsBridge("ACTIVE");
      lastSyncTime = TimeCurrent();
   }

   if(InpMoveToBreakEven) ManageBreakEven();

   datetime barTime = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(barTime == lastBar) return;
   lastBar = barTime;

   if(HasPosition()) return;

   int highestIdx = iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, InpSwingLookback, 2);
   int lowestIdx  = iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW, InpSwingLookback, 2);
   if(highestIdx < 0 || lowestIdx < 0) return;

   double swingHigh = iHigh(_Symbol, PERIOD_CURRENT, highestIdx);
   double swingLow  = iLow(_Symbol, PERIOD_CURRENT, lowestIdx);

   double low1  = iLow(_Symbol, PERIOD_CURRENT, 1);
   double high1 = iHigh(_Symbol, PERIOD_CURRENT, 1);
   double close1 = iClose(_Symbol, PERIOD_CURRENT, 1);
   double open1  = iOpen(_Symbol, PERIOD_CURRENT, 1);

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   // Bullish Sell-Side Liquidity Sweep + Reclaim (Turtle Soup / SMC OB)
   if(low1 < swingLow && close1 > swingLow && close1 > open1)
   {
      double sl = NormalizeDouble(low1 - (20 * _Point), _Digits);
      double dist = ask - sl;
      if(dist > 0)
      {
         double tp = NormalizeDouble(ask + dist * InpRewardRisk, _Digits);
         if(trade.Buy(CalcLots(dist), _Symbol, ask, sl, tp, "GRIDPIPs SMC SSL Sweep"))
         {
            SyncWithGRIDPIPsBridge("BUY_EXECUTED");
         }
      }
   }
   // Bearish Buy-Side Liquidity Sweep + Rejection
   else if(high1 > swingHigh && close1 < swingHigh && close1 < open1)
   {
      double sl = NormalizeDouble(high1 + (20 * _Point), _Digits);
      double dist = sl - bid;
      if(dist > 0)
      {
         double tp = NormalizeDouble(bid - dist * InpRewardRisk, _Digits);
         if(trade.Sell(CalcLots(dist), _Symbol, bid, sl, tp, "GRIDPIPs SMC BSL Sweep"))
         {
            SyncWithGRIDPIPsBridge("SELL_EXECUTED");
         }
      }
   }
}

int CountOpenEaPositions()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionGetTicket(i) > 0 &&
         PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
         count++;
   }
   return count;
}

bool HasPosition()
{
   return CountOpenEaPositions() > 0;
}

double CalcLots(double slDist)
{
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double risk = bal * (InpRiskPercent / 100.0);
   double tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minL = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxL = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(tv <= 0 || ts <= 0 || slDist <= 0) return minL;
   double lots = MathFloor((risk / ((slDist / ts) * tv)) / step) * step;
   return MathMax(minL, MathMin(maxL, NormalizeDouble(lots, 2)));
}

void ManageBreakEven()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != InpMagicNumber) continue;
      double openP = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl    = PositionGetDouble(POSITION_SL);
      double tp    = PositionGetDouble(POSITION_TP);
      long type    = PositionGetInteger(POSITION_TYPE);
      if(type == POSITION_TYPE_BUY && sl < openP)
      {
         double risk = openP - sl;
         if(SymbolInfoDouble(_Symbol, SYMBOL_BID) >= openP + risk * 1.5)
            trade.PositionModify(ticket, openP + 5 * _Point, tp);
      }
      else if(type == POSITION_TYPE_SELL && sl > openP)
      {
         double risk = sl - openP;
         if(SymbolInfoDouble(_Symbol, SYMBOL_ASK) <= openP - risk * 1.5)
            trade.PositionModify(ticket, openP - 5 * _Point, tp);
      }
   }
}

string ExtractJsonValue(string json, string key)
{
   string needle = "\\"" + key + "\\":";
   int pos = StringFind(json, needle);
   if(pos < 0) return "";
   int start = pos + StringLen(needle);
   while(start < StringLen(json) && (StringGetCharacter(json, start) == ' ' || StringGetCharacter(json, start) == '\\t')) start++;
   if(start >= StringLen(json)) return "";
   if(StringGetCharacter(json, start) == '"')
   {
      start++;
      int endQ = StringFind(json, "\\"", start);
      if(endQ < 0) return "";
      return StringSubstr(json, start, endQ - start);
   }
   int endC = StringFind(json, ",", start);
   int endB = StringFind(json, "}", start);
   int endIdx = (endC >= 0 && (endB < 0 || endC < endB)) ? endC : endB;
   if(endIdx < 0) endIdx = StringLen(json);
   return StringSubstr(json, start, endIdx - start);
}

void ExecuteRemoteCommandIfPresent(string responseBody)
{
   if(StringFind(responseBody, "\\"autoTradeEnabled\\":true") < 0) return;
   string cmdIdStr = ExtractJsonValue(responseBody, "cmdId");
   long cmdId = StringToInteger(cmdIdStr);
   if(cmdId <= 0) return;

   string cmdSym  = ExtractJsonValue(responseBody, "cmdSymbol");
   string cmdSide = ExtractJsonValue(responseBody, "cmdSide");
   double cmdVol  = StringToDouble(ExtractJsonValue(responseBody, "cmdVol"));
   double cmdSl   = StringToDouble(ExtractJsonValue(responseBody, "cmdSl"));
   double cmdTp   = StringToDouble(ExtractJsonValue(responseBody, "cmdTp"));

   if(StringLen(cmdSym) < 3) cmdSym = _Symbol;
   if(cmdVol <= 0) cmdVol = SymbolInfoDouble(cmdSym, SYMBOL_VOLUME_MIN);
   SymbolSelect(cmdSym, true);

   int symDigits = (int)SymbolInfoInteger(cmdSym, SYMBOL_DIGITS);
   double sl = (cmdSl > 0) ? NormalizeDouble(cmdSl, symDigits) : 0;
   double tp = (cmdTp > 0) ? NormalizeDouble(cmdTp, symDigits) : 0;
   bool ok = false;

   if(cmdSide == "BUY")
      ok = trade.Buy(cmdVol, cmdSym, SymbolInfoDouble(cmdSym, SYMBOL_ASK), sl, tp, "GRIDPIPs Auto-Trade");
   else if(cmdSide == "SELL")
      ok = trade.Sell(cmdVol, cmdSym, SymbolInfoDouble(cmdSym, SYMBOL_BID), sl, tp, "GRIDPIPs Auto-Trade");

   if(ok)
      AcknowledgeCommandExecution(cmdId, "EXECUTED");
   else
      AcknowledgeCommandExecution(cmdId, "FAILED");
}

void AcknowledgeCommandExecution(long cmdId, string cmdStatus)
{
   string headers = "Content-Type: application/json\\r\\n";
   string payload = StringFormat(
      "{\\"token\\":\\"%s\\",\\"login\\":\\"%I64d\\",\\"server\\":\\"%s\\",\\"symbol\\":\\"%s\\",\\"balance\\":%.2f,\\"equity\\":%.2f,\\"openPositions\\":%d,\\"eaName\\":\\"SMC Order Block EA\\",\\"status\\":\\"CMD_%s\\",\\"executedCmdId\\":%I64d}",
      InpBridgeToken,
      AccountInfoInteger(ACCOUNT_LOGIN),
      AccountInfoString(ACCOUNT_SERVER),
      _Symbol,
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      CountOpenEaPositions(),
      cmdStatus,
      cmdId
   );
   char post[], result[];
   StringToCharArray(payload, post, 0, StringLen(payload));
   string resHeaders;
   WebRequest("POST", InpBridgeUrl, headers, 4000, post, result, resHeaders);
}

void SyncWithGRIDPIPsBridge(string eventStatus)
{
   if(!InpEnableWebBridge || StringLen(InpBridgeToken) < 8) return;
   string headers = "Content-Type: application/json\\r\\n";
   string payload = StringFormat(
      "{\\"token\\":\\"%s\\",\\"login\\":\\"%I64d\\",\\"server\\":\\"%s\\",\\"symbol\\":\\"%s\\",\\"balance\\":%.2f,\\"equity\\":%.2f,\\"openPositions\\":%d,\\"eaName\\":\\"SMC Order Block EA\\",\\"status\\":\\"%s\\"}",
      InpBridgeToken,
      AccountInfoInteger(ACCOUNT_LOGIN),
      AccountInfoString(ACCOUNT_SERVER),
      _Symbol,
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      CountOpenEaPositions(),
      eventStatus
   );
   char post[], result[];
   StringToCharArray(payload, post, 0, StringLen(payload));
   string resHeaders;
   ResetLastError();
   int code = WebRequest("POST", InpBridgeUrl, headers, 4000, post, result, resHeaders);
   if(code == -1)
   {
      int err = GetLastError();
      if(err == 4014)
         Print("GRIDPIPs Bridge: Whitelist ", InpBridgeUrl, " under MT5 Tools -> Options -> Expert Advisors -> Allow WebRequest.");
      else
         Print("GRIDPIPs Bridge error code: ", err);
      return;
   }
   string body = CharArrayToString(result);
   ExecuteRemoteCommandIfPresent(body);
}
`;
}

export const ICT_SILVER_BULLET_MQ5 = buildSilverBulletEa(
  'https://grid-pips.vercel.app/api/ea/mt5/heartbeat',
  'PASTE_YOUR_BRIDGE_TOKEN_HERE'
);

export const SMC_ORDERBLOCK_MQ5 = buildSmcOrderBlockEa(
  'https://grid-pips.vercel.app/api/ea/mt5/heartbeat',
  'PASTE_YOUR_BRIDGE_TOKEN_HERE'
);

export function buildInstallationGuide(userName: string, bridgeToken: string, appUrl: string): string {
  const base = appUrl.replace(/\/+$/, '');
  return `====================================================================
GRIDPIPs MQL5 EXPERT ADVISOR PACK — INSTALLATION & MT5 BRIDGE GUIDE
====================================================================
Licensed To: ${userName}
Telegram Community: https://t.me/JakoyoFx
Exness IB Partner Portal: https://one.exnessonelink.com/a/0p67hxlswg?source=app

INCLUDED PRE-CONFIGURED SOURCE FILES:
1. GRIDPIPs_ICT_SilverBullet_EA.mq5  (ICT Fair Value Gap + Killzone Engine)
2. GRIDPIPs_SMC_OrderBlock_EA.mq5    (SMC Liquidity Sweep + Order Block Engine)

Note: Your personal Bridge URL and Token are ALREADY embedded inside both .mq5 files.

--------------------------------------------------------------------
STEP 1: INSTALL & COMPILE IN METATRADER 5 (MT5)
--------------------------------------------------------------------
1. Open your Exness MetaTrader 5 desktop terminal.
2. Click File -> Open Data Folder.
3. Open the folder: MQL5 -> Experts -> Advisors.
4. Copy both .mq5 files into the Advisors folder.
5. In MT5, press F4 to open MetaEditor (or click Tools -> MetaQuotes Language Editor).
6. Open each .mq5 file from Experts/Advisors and click "Compile" (F7).
   Verify 0 errors in the Toolbox tab.

--------------------------------------------------------------------
STEP 2: ENABLE MT5 BRIDGE CONNECTION (REQUIRED FOR LIVE SYNC)
--------------------------------------------------------------------
1. In MetaTrader 5, go to Tools -> Options -> Expert Advisors.
2. Check "Allow algorithmic trading".
3. Check "Allow WebRequest for listed URL" and add:
   ${base}
4. Drag either EA onto an M1, M5, M15, or H1 chart (EURUSD, GBPUSD, XAUUSD, or NAS100).
5. Confirm EA Inputs (already pre-filled):
   - InpEnableWebBridge = true
   - InpBridgeUrl = ${base}/api/ea/mt5/heartbeat
   - InpBridgeToken = ${bridgeToken}
   - InpRiskPercent = 1.0 (recommended 0.5% - 1.5% per trade)
6. Ensure the "Algo Trading" button at the top of MT5 is GREEN.

--------------------------------------------------------------------
STEP 3: OPTION B — MTAPI5 SOCKET API (https://github.com/vdemydiuk/mtapi)
--------------------------------------------------------------------
For direct WebSocket API control (live Balance/Equity & instant BUY/SELL):
1. Download the latest MtApi5Installer_x64.msi from:
   https://github.com/vdemydiuk/mtapi/releases
2. Run the installer on your trading PC or Windows Forex VPS (this installs
   MtApi5 Service on default port 8228 plus MtApi5.ex5 in MetaTrader 5).
3. Open MetaTrader 5 -> Navigator -> Expert Advisors -> attach MtApi5 EA
   to any chart and ensure "Algo Trading" is GREEN.
4. In your GRIDPIPs MQL5 EA Bots tab, select "MtApi5 Socket API (vdemydiuk/mtapi)",
   enter your VPS/tunnel Host and Port 8228, and press "Connect Client MT5 Account".

--------------------------------------------------------------------
STEP 4: RECOMMENDED EXNESS MT5 SETTINGS
--------------------------------------------------------------------
- Recommended Broker: Exness (Raw Spread or Pro account via IB link)
- Best Pairs: EURUSD, GBPUSD, XAUUSD, NAS100, US30
- Recommended Timeframes: M1 / M5 / M15 (Silver Bullet) or H1 (SMC Order Block)
- Always test on an Exness MT5 Trial/Demo account before live deployment.

Support & Live ICT Breakdowns: https://t.me/JakoyoFx
====================================================================
`;
}
