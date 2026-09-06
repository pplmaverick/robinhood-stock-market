# DESIGN.md — Robinhood Stock Prediction Market

專案專屬視覺設計系統。這份文件定義色彩、字體、排版與各頁面差異化策略的**規則與理由**，
不是最終逐頁視覺稿。Hero / 版面的具體變體會在這份文件確認後，另外產出 2-3 版讓你選。

範圍：只涉及 `className` / `style` / Tailwind 設定 / CSS。不涉及 hooks、資料抓取、
合約呼叫邏輯——這些在整個視覺重新設計過程中保持完全不動。

---

## 0. 現況診斷（為什麼看起來像 AI 生成）

在動手設計前，先記錄從現有 4 個頁面 + `Navbar`/`StatusBadge`/`Countdown`/
`AgentDecisionPanel`/`tailwind.config.js` 讀到的具體問題，每一條後面的設計決策都是
針對這裡面某一條的直接回應：

1. **色彩系統是 Material Design 3 Theme Builder 的直接輸出**——`tailwind.config.js`
   裡 `on-primary-fixed-variant`、`tertiary-fixed-dim` 這類 token 命名是 MD3 產生器的
   標準格式，不是手工設計的品牌色系。
2. **BEAR 語意色是粉紅色，不是紅色**（`secondary: '#ffb3b2'`）。這不是「不夠有層次」，
   是語意本身選錯了色相。
3. **`primary`（綠色）身兼三職**：品牌識別（Navbar logo 圓點）、通用互動色（Connect
   按鈕、focus ring、MAX 按鈕）、金融語意色（BULLISH）全部共用同一個 token。這是
   「一眼看出只有一個強調色」的根本原因。
4. **語意色會脫離 token 系統，直接寫死 hex**：`StatusBadge.jsx` 的 `#00d085`/`#fbbf24`、
   `MarketStatus.jsx` 統計列的 `text-[#00d085]`——同一個「OPEN」在不同檔案可能對不上,
   未來要調色得改好幾個地方。
5. **卡片疊卡片**：`Markets.jsx` 下注表單裡「Potential Payout」區塊
   （`bg-surface-container-low border ... rounded-lg`）包在外層下注卡片
   （`bg-surface-container border ... rounded-lg`）裡面，是 hard-ban 明確禁止的樣式。
6. **每個區塊都套用同一種「卡片」處理**：Hero、BULL/BEAR 卡、Terminal Logs、下注表單、
   Agent Decision Panel 全部都是 `bg-surface-container rounded-lg border p-6`，沒有
   任何一個元素在視覺上比其他元素重——沒有焦點，只有並列的方塊。
7. **Navbar 是教科書式模板**：logo 左、導覽置中、CTA 右，是 hard-ban 點名的「沒有變化
   的 navbar」結構。
8. **Icon 是通用 Material Symbols，且選字很直譯**：Amazon 用 `shopping_cart`、
   AMD/NVDA 都用 `memory`/`memory_alt`——典型「AI 照公司業務選對應 icon」的模式。
9. **對稱到底**：`grid-cols-2`、`lg:grid-cols-10`（6/4 對分）、`gutter` 在所有斷點都是
   同一個 `1rem`，`spacing.margin-x`（2rem）這個 token 定義了但整個程式碼庫沒有任何
   地方用到——視覺系統有骨架，但沒有被真正拿來做出不對稱的呼吸感。
10. **文字灰階只有兩層**：`on-surface`（亮）/`on-surface-variant`（暗），中間沒有第三層,
    導致次要 metadata（時間戳、輔助說明）跟主要數據視覺權重分不太開。

---

## 1. 色彩系統

### 1.1 三層色彩角色（這是解決「只有一個綠色」的核心規則）

現有程式碼把「品牌互動色」跟「金融語意色」混在同一個 `primary` token 裡。新系統把
顏色拆成三個獨立角色，**各自有專屬 token，互不共用**：

| 角色 | 用途 | 現況問題 | 新規則 |
|---|---|---|---|
| **Signal（品牌互動色）** | Connect 按鈕、focus ring、active nav tab、連結、MAX 按鈕、Agent Activity 的終端機主色 | 目前借用綠色 `primary` | 獨立的 cyan-blue 色相，綠色**永遠不再**用來做「這是可以點的東西」 |
| **語意色（金融方向）** | BULL / BEAR | BEAR 目前是粉紅色 | BULL=綠、BEAR=**紅**（不是粉紅），兩者只在「看多/看空」語境出現 |
| **語意色（市場狀態）** | OPEN / LOCKED / SETTLED | 三色寫死在兩個檔案裡 | 三個獨立 token，集中定義一次，`StatusBadge` 跟任何用到狀態色的地方都引用同一份 |
| **System（系統回饋）** | 交易失敗、表單驗證錯誤 | 目前跟 BEAR 是不同色但沒有明確規則 | 橘紅色系，色相刻意跟 BEAR 的玫瑰紅拉開，避免使用者把「你賭錯方向」跟「系統出錯」搞混 |

**規則本身就是防止衝突的機制**：Signal 藍絕不出現在語意色的語境，語意色也絕不
被借去做「這是個按鈕」的暗示。這樣即使 Agent Activity 用 Signal 藍當主視覺，
Markets 用綠/紅當方向指標，兩者不會打架——因為它們回答的是不同問題
（「這是互動元件」vs.「這是看多還是看空」）。

### 1.2 具體色值

沿用現有 MD3 中性色階（背景/表面已經有 7 級夠用，不重做），但重新定義品牌/語意色，
並把文字灰階從 2 層擴到 3 層：

```
// ── Neutral (背景/表面，沿用現有 7 級，全站共用同一份，不分頁面) ──
surface-container-lowest   #0a0e1a   最外層背景
surface-container-low      #171b28   卡片背景（次要）
surface-container          #1b1f2c   卡片背景（主要）
surface-container-high     #262a37   卡片內再分層（例如 icon 底）
surface-container-highest  #313442   最高對比的表面（active tab 底、input focus 底）

// ── 文字灰階：3 層（新增第 3 層） ──
on-surface                 #dfe2f3   主要文字/數據
on-surface-variant         #9aa3c0   次要文字/標籤（比現況 #bacbbd 略降飽和，跟品牌綠拉開）
on-surface-faint           #5b6280   （新增）第三層：時間戳、meta 註記、停用狀態文字

// ── Signal：品牌互動色（cyan-blue，取代綠色的「按鈕/連結」職責）──
signal                     #38bdf8   預設：Connect 按鈕、連結、focus ring、active nav 底線
signal-dim                 #7dd3fc   hover/次要強調（沿用現有 tertiary-fixed 家族的色相邏輯）
signal-bright              #a6e6ff   Agent Activity 終端機裡最亮的「游標/prompt」色
signal-deep                #0c4a6e   Signal 色的深色底（tinted background，例如 info note 底色）

// ── 語意：方向 (BULL/BEAR，只用在下注方向 context) ──
bull                       #34d399   BULLISH（比現有 #43ed9f 略降飽和、偏 emerald，少一點螢光感）
bull-deep                  #059669   BULL 邊框/pressed 狀態
bull-tint                  #0a2e22   BULL 背景色暈（10-15% 透明度取代，或直接用此 tint 當底色）

bear                       #fb7185   BEARISH（rose-400，取代粉紅色）
bear-deep                  #be123c   BEAR 邊框/pressed 狀態
bear-tint                  #2e0a14   BEAR 背景色暈

// ── 語意：市場狀態 (OPEN/LOCKED/SETTLED，集中定義，StatusBadge 唯一來源) ──
state-open                 = bull            （複用 BULL 色相：開放中 = 正向/活躍）
state-locked               #fbbf24          （琥珀色，沿用現有值，語意已經正確）
state-settled              = on-surface-variant （沿用現有：settled = 中性/歸檔感）

// ── System：系統回饋（跟 BEAR 拉開色相，避免「賭錯」跟「系統壞了」混淆）──
error                      #ff6b4a          橘紅，沿用現有 error 家族的色相方向但更明確跟 bear 拉開
error-deep                 #93000a          （沿用現有 error-container）
```

**BULL/BEAR 為什麼還是綠/紅**：這是金融 UI 的通用視覺語言（TradingView、Hyperliquid、
GMX 全部如此），改成別的顏色反而增加認知負擔。真正的問題不是「BULL 是綠色」，而是
「綠色同時也是品牌色跟按鈕色」——1.1 的三層角色拆分已經解決這個問題，不需要靠換
BULL 的顏色來解決。

**實作規則**：`StatusBadge.jsx` 跟 `MarketStatus.jsx` 統計列裡目前寫死的 `#00d085`/
`#fbbf24` 全部改為引用 `state-open`/`state-locked`/`state-settled` token——這是這次
視覺重製唯一會touch到「顏色來源」而非單純「顏色數值」的修正，因為現況的寫死方式本身
就會造成未來調色時的不一致，等實作階段一併處理。

---

## 2. 字體系統

現有的 Inter（標題/內文）+ JetBrains Mono（數據）配對本身是對的方向（Stripe/Mercury
一類的 fintech 介面都這樣配），問題不在「換字體」，在於：(a) 沒有清楚的 scale 邏輯、
(b) 該用 mono 的地方沒有用滿、(c) hero 數字直接用 inline `style={{fontSize:48}}` 跳過
整個 scale 系統。

### 2.1 分工原則（不换字體，重新定義誰負責什麼）

- **Inter**：標題、按鈕文字、敘述性內文（例如頁面說明句）、導覽。負責「人話」。
- **JetBrains Mono**：所有數字——價格、ETH 金額、百分比、地址、market ID、倒數計時、
  表格裡的數值欄位。負責「機器/精確」的視覺訊號，這條規則現有程式碼其實已經大致遵守
  （`fmtPrice`/`fmtEth` 的顯示都用了 `font-data-*`），保留並嚴格化，唯一例外是 Agent
  Activity 頁面（見第 4 節）——那一頁連敘述文字都刻意偏向 mono，強化終端機感。

### 2.2 Type scale（改用一致比例，取代現有的隨意數值）

現有數值（11/12/14/18/20/24px）彼此比例不一致，且 hero 價格用 inline style 48px
完全跳出系統。改用以 14px 為基準、約 1.25 倍率的 scale，並把「hero 數字」正式收編
進 scale 而不是用 inline style：

```
label-caps    11px / 16px lh / +0.05em tracking / 700   —  維持現況，這個尺寸已經對
data-sm       12px / 16px lh / +0.02em tracking / 400   —  維持
body-sm       12px / 16px lh / 400                       —  維持
body-md       14px / 20px lh / 400                       —  維持
data-md       14px / 20px lh / 500                       —  維持
data-lg       18px / 24px lh / 500                       —  維持
headline-md   20px / 28px lh / 600                       —  維持
headline-lg   28px / 36px lh / -0.02em / 600             —  從 24px 略升，讓頁面標題
                                                             跟 headline-md 的級距更明顯
data-xl       36px / 40px lh / -0.01em / 600  (新增)      —  表格/清單裡的重點數字
display-num   56px / 56px lh / -0.02em / 700  (新增)      —  取代 Markets hero 的
                                                             inline style={{fontSize:48}}，
                                                             正式收進 token，往上加大
                                                             一點讓 hero 更有「這是本頁
                                                             最重要的數字」的份量
```

`display-num` 只在「本頁面最核心的單一數字」使用——目前只有 Markets hero 的即時股價
符合資格。不濫用在其他地方，避免每個數字都想當主角。

---

## 3. 排版網格與留白邏輯

### 3.1 核心規則：不是每個區塊都值得一張卡片

現況最大的「模板感」來源是每個內容區塊都套相同的 `bg-surface-container border
rounded-lg p-6`，導致 hero、下注卡、terminal logs、agent panel 視覺權重完全一樣。
新規則按「這個區塊是不是本頁面使用者此刻最需要決策/閱讀的東西」分成三級：

- **Level 1 焦點區**（每頁最多一個）：完整卡片處理 + 比其他區塊更大的內距
  （p-8～p-10 而非 p-6）。例如 Markets 的股價 hero、MyBets 的表格本體、Agent Activity
  的 decision panel 本身。
- **Level 2 內容區**：保留邊框但內距收斂（p-6），視覺上明確次於 Level 1。例如
  Markets 的 BULL/BEAR 選擇卡、下注表單。
- **Level 3 支援區**：**不再套用完整卡片**，改用「只有一條分隔線 + 留白」的輕量處理。
  例如 Terminal Logs 區塊——目前跟 hero 用一模一樣的卡片語言，改成只用
  `border-t border-outline-variant` 分隔，背景直接透到頁面底色，讓它明確讀作「hero
  底下的補充資訊」而不是另一個平起平坐的區塊。

### 3.2 拆掉卡片疊卡片

下注表單裡「Potential Payout / Platform Fee / Estimated Total」目前是一個有底色
+ 邊框的盒子，包在下注表單卡片裡面——直接違反 hard-ban。改法：拿掉內層的
`bg-surface-container-low border rounded-lg`，改成只用 `border-t border-outline-variant
pt-4` 做視覺分段，讓它讀作「表單的最後一個 section」而不是「盒子裡的盒子」。

**復發記錄（2026-09-06，Hero 變體審查時發現）**：出 Hero 三個變體讓使用者選的時候，
變體 B（Bold Split）把 meta 欄位（Open Price / Settlement / Status）包進一個
`bg-signal/5 border border-outline-variant rounded-lg` 的「meta-panel」盒子裡，而
這個盒子本身又坐在外層 hero 卡片（`bg-surface-container border rounded-lg`）裡面——
跟本節開頭那個下注表單的問題是同一種模式，只是換了地方再犯一次。使用者沒選 B，
問題在實作前的審查階段就被抓到，沒有進到程式碼裡，但值得記下來：**「把一組相關欄位
框起來」這個直覺，很容易不自覺地變成卡片疊卡片**，尤其是在已經有外層卡片的區塊裡
又想替某個子群組「加個框強調」的時候。下次設計新變體或做 review 時，看到
「卡片內部又有一個帶邊框/底色的盒子」就要先問：能不能改成只用分隔線
（`border-t`/`border-r`）或間距做區隔，而不是再開一層 `bg-*` + `border` + `rounded`。
本次實際選中的 Hero C（Ticker Frame）沒有這個問題——它的 meta 欄位是用
`border-r` 分隔的單排 ledger row，不是獨立的盒子。

### 3.3 刻意的不對稱

- **Hero 區**：現況 `md:items-end justify-between` 已經有基本的左重右輕，保留這個
  方向並加強——股價（`display-num`）維持左側主導，右側的 OPEN PRICE / SETTLEMENT /
  STATUS 三個 meta 欄位不需要跟左邊等高對齊，可以用更緊湊的間距讓它們明確是
  「附屬資訊」而非平行內容。
- **Sparkline 裝飾**：現況是 hero 底部一條獨立的裝飾線，跟上面的價格資訊沒有視覺
  關聯。改為讓 sparkline 以低透明度**背景水印**的方式鋪在整個 hero 卡片後方（價格
  數字疊在上面），讓它讀作「這張卡片背後的走勢紋理」而不是「額外貼上去的一條線」。
- **下注表單 vs 主內容欄**：現況 `lg:grid-cols-10` 切成 6/4，是很工整的比例。保留
  欄寬比例（實際下注表單不宜太寬，功能上沒有理由改），但下注表單維持 `sticky top-24`
  的同時，讓它的內距跟主內容欄的內距不對稱（表單更緊湊、主內容欄留更多呼吸空間），
  避免「兩欄看起來像同一個元件複製貼上」的觀感。
- **`margin-x`（2rem）token 啟用**：目前定義了卻沒有任何地方用到。用在頁面級的
  上下留白（例如頁首標題區跟下方內容之間），跟 `gutter`（1rem，水平內距）做出「垂直
  呼吸感 > 水平內距」的層次，而不是所有間距都用同一個 1rem 打天下。

### 3.4 Navbar：打破「logo 左/導覽置中/CTA 右」模板

現況是教科書式三段式 navbar，正好是 hard-ban 點名的樣式。改法：導覽項目改成貼齊
logo 右側（而非用 `justify-between` 讓它們居中飄在中間），視覺上讀作「logo + 分頁
tab 是一組」，錢包資訊/Connect 按鈕獨立靠右——這比對稱三段式更接近 dYdX/Hyperliquid
那種「交易終端的 tab bar」語彙，也呼應 crypto-native-dashboard 的協議介面感。
Active tab 用 Signal 藍的底線標示（取代現況的 `text-tertiary-fixed-dim font-bold`
純文字變色），跟三層色彩系統的「Signal = 互動色」規則一致。

---

## 4. 各頁面視覺差異化策略

### 4.1 共同基礎（全站不變，避免兩種風格打架）

不論走協議介面感還是終端機感，以下項目**全站統一**，這是避免風格衝突的關鍵：

- 同一份中性背景色階（1.2 節的 Neutral）
- 同一份三層色彩角色（Signal / 語意方向 / 語意狀態）
- 同一套 type scale 與兩個字體家族
- 同一套 spacing scale 與 border-radius（維持現有 4px/8px 的低圓角——這本身就偏
  「協議/終端」語彙，兩邊都適用，不需要為了風格差異而分裂圓角系統）
- Navbar / Footer 維持中性「介面外殼」語言，不隨頁面切換風格——使用者的方向感
  （我在哪一頁、怎麼切換）永遠來自穩定的外殼，終端機感只發生在**內容區**

### 4.2 Markets + Market Status → 協議介面感（crypto-native-dashboard）

對應 Uniswap 的簡潔下注流程、Aave 的密集數據排版、Zapper/DeBank 的多資產列表：

- Level 1/2/3 卡片分級（3.1 節）讓 hero 明確突出，其餘區塊收斂
- Market Status 的表格數值欄位（Bull Pool / Bear Pool / Total）**靠右對齊**（現況
  是統一靠左，數字類欄位靠右對齊是金融表格的標準慣例，也讓 mono 字體的等寬對齊
  真正發揮作用）
- 表格 row 之間不加 zebra 底色（現況已經是這樣，維持），靠 hover 態
  （`hover:bg-surface-variant/10`）跟表頭的視覺重量做區分，符合 Aave/Uniswap 那種
  「資料密度高但不壓迫」的調性
- Ticker bar 維持橫向 scroll 的即時報價列，但價格數字統一用 `data-md` 而非現況的
  `data-sm`，讓它在視覺上更接近「真正在跳動的報價」而非附屬標籤

### 4.3 Agent Activity → 終端機感（cyberpunk-terminal）

這是核心敘事頁面，要讓使用者感覺「看得到 agent 在思考」。對應 Bloomberg
Terminal 的資訊密度、TradingView 的深色圖表介面、Hyperliquid 的專業交易終端調性：

- **主色改用 Signal 藍**（不是 GMX/Hyperliquid 常見的螢光綠終端機配色）——因為這頁
  的 Step2/Step3 本身會顯示 BULL/BEAR 的判斷結果，若整頁底色也是綠色系，會讓
  「終端機的環境色」跟「這次判斷是看多」兩件事糊在一起。Signal 藍是中性的「系統正在
  運作」訊號，跟語意色的紅/綠完全不衝突，這正是三層色彩系統存在的意義。
- **Step 編號從圓形徽章改成終端機提示字元**：現況 `StepHeader` 用
  `w-6 h-6 rounded-full` 的圓形數字徽章，是很通用的「stepper 元件」樣式。改成
  `[01]` `[02]` `[03]` 這種方括號 + mono 字體的提示字元風格，一眼就是終端機輸出格式，
  不是通用元件庫長相。
- **敘述文字部分改用 mono**：現況全站的說明文字（`Note` 元件內文）都用 Inter。
  這一頁的 `Note`/reasoning 文字改用 `font-data-sm`/`font-data-md`，讓「agent 在
  說話」讀起來像日誌輸出，跟 Markets/MyBets 的人話說明文字產生明確的材質差異——
  這是這一頁唯一偏離「Inter 負責人話」規則的地方，理由已經在 2.1 節說明。
- **StepBlock 的揭露動效加終端機質感**：現況的 `opacity`/`translate-y` 漸現保留
  （已經是「快速、有目的」的動效，符合 motion 規則），但在每個新揭露的 step 前面加上
  一個短暫的 `> ` prompt 字元 + 游標閃爍效果，讓三段式揭露讀作「終端機正在逐行印出
  推理過程」而不是「卡片漸漸淡入」。
- **PanelShell 保留完整卡片**（Level 1 焦點區）——這頁只有一個核心元件，不需要
  3.1 節的分級,但卡片的邊框可以比其他頁面的 Level 1 卡片更亮/更細，模擬終端機視窗
  的邊界感。

### 4.4 My Bets → 沿用協議介面感，微調個人化

MyBets 本質是「我的持倉表格」，最接近 4.2 節的協議介面感（Aave 的個人資產總覽最像）。
不需要獨立的一套規則，套用 4.2 的表格慣例即可（數字靠右對齊、mono 對齊）。唯一的
差異化是統計卡（Total Stake / Unclaimed）維持 Level 1 待遇（這是使用者最關心的
兩個數字），表格本身是 Level 1（核心內容），不需要額外的 Level 2/3 分級。

---

## 5. Marketing 頁面 vs App 頁面

**現況**：`App.jsx` 的 `/` 路由直接指向 `Markets`（也就是 app 本身），整個專案沒有
獨立的行銷首頁/介紹頁——四個路由（Markets / My Bets / Market Status / Agent
Activity）全部都是「使用者已經在操作」的 App 頁面。這次視覺重製的範圍本來就是這
四頁，不涉及新增行銷頁，所以這裡先如實回報現況，不假裝有一個不存在的頁面。

**如果之後要加行銷首頁**（例如黑客松展示用的介紹頁），區分原則會是：

| | Marketing 頁 | App 頁（現有 4 頁） |
|---|---|---|
| 目的 | 說服陌生訪客「這是什麼、為什麼特別」 | 協助已經理解產品的使用者完成操作 |
| 資訊密度 | 低，大留白，敘事節奏由上往下 | 高，數據優先，一屏內盡量呈現可決策資訊 |
| Hero | 可以用大字敘事 + 視覺化 demo（例如
Agent Activity 的終端機動畫截圖） | Hero 是即時數據本身（股價），不是敘事 |
| 色彩使用 | 可以更大膽用 Signal 藍做視覺主調 | 色彩服務語意（BULL/BEAR/狀態），克制用色 |
| CTA | 「Connect Wallet」「查看即時 Agent 決策」等導流性 CTA | 功能性按鈕（下注、claim、切換頁籤） |

這一節目前是「原則備忘」，不是本次要交付的頁面。

---

## 6. Hard-ban 自我檢查（對照 frontend-design skill 規則）

| 規則 | 現況 | 這份設計如何處理 |
|---|---|---|
| Inter 當唯一字體 | 未違反（已配 mono），但 mono 用量不足 | 2.1 節嚴格化 mono 的使用場景，Agent Activity 額外擴大 mono 用量 |
| purple-to-blue 漸層 | 未使用 | 維持不用；hero 背景水印用單一色相的 radial fade，不做雙色漸層 |
| 卡片疊卡片 | **違反**（下注表單內的 payout 區塊） | 3.2 節明訂拆除 |
| icon tile 置中在標題上方 | 未違反 | 維持 |
| 模板化 navbar（logo/中間導覽/右 CTA） | **違反** | 3.4 節改為 logo+tab 一組、CTA 獨立右側 |
| 每個元素都置中 | 部分違反（多處 grid 對稱分欄） | 3.3 節加入不對稱處理 |
| 飽和背景上的灰字 | 需在實作時逐一檢查對比度 | 色值定案後對每個「彩色底+文字」組合做 WCAG AA 檢查 |
| 通用 3D 插畫/stock icon 包 | **違反**（Material Symbols 直譯式選字） | 實作階段規劃：至少 Markets 的 5 檔股票 icon 改用不那麼直譯的處理方式（例如統一用 ticker 字母而非業務聯想 icon） |
| bounce/elastic easing | 未違反 | 維持現有 ease-based transition |

---

## 7. 不動的範圍（再次確認）

以下完全不受這次視覺設計影響：

- 所有 `useState`/`useEffect`/`useRef`/`useMemo`/`useCallback` 邏輯
- 所有 wagmi hooks（`useReadContract`/`useWriteContract`/`useWaitForTransactionReceipt` 等）
  的呼叫方式、參數、依賴陣列
- 合約地址、ABI、鏈上讀寫邏輯
- `constants.js` 的資料結構（STOCKS 陣列的 token/priceFeed 地址等）
- 元件的 props 介面與資料流方向

唯一例外是第 1.2 節提到的「把寫死的語意色 hex 改成引用 token」——這是顏色**來源**
的整併，不改變任何邏輯分支或渲染條件。

---

## 下一步

這份文件確認後，下一步會針對以下項目各產出 2-3 個視覺變體（不會直接定案單一版本）：

1. Markets 頁 Hero 區的具體排版（sparkline 水印處理、display-num 數字呈現方式）
2. Navbar 的 tab 樣式（底線 / 背景 pill / 其他 Signal 藍標示方式）
3. Agent Activity 的終端機視窗 chrome（`[01]` 提示字元的具體樣式、prompt/游標動效）

等你看過這份 DESIGN.md 並確認方向（或提出修改）之後才會開始出變體。
