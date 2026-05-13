# SciSpace

SciSpace は、科学計算データの読み込み、表編集、プロット、コマンド操作を 1 つの
ブラウザ内ワークスペースで扱うための Vite+ / React ベースの PoC です。

画面全体に Figma 風の広いキャンバスを置き、その上に Data Browser、Table、
Plot、Import、Terminal、Command History などのウィンドウを配置します。各ウィンドウは
ドラッグ、リサイズ、前面化、コンテキストメニュー操作に対応します。

## 現在の位置づけ

- クライアントサイド中心の研究データ作業環境 PoC です。
- データ、プロジェクト、ウィンドウ配置、コマンド履歴は Dexie / IndexedDB に保存します。
- GUI 操作の多くは内部的に `scispace` コマンドへ変換され、Terminal と Command History から再実行できます。
- Go バイナリはビルド済み Web アプリを埋め込んでローカル配信するためのラッパーです。ネイティブデスクトップアプリではありません。

## 主な実装済み機能

### Workspace

- オフホワイト背景のドットグリッド付きキャンバス。
- 背景ドラッグ、ホイール、Shift + ホイールによるパン操作。
- カーソル位置基準のズーム操作。
- Table / Plot / Terminal / Import などのマルチウィンドウ表示。
- Window メニュー、右クリックコンテキストメニュー、背景コンテキストメニュー。
- Data Browser / Terminal / Command History / Help などのユーティリティウィンドウ表示切替。

### Project

- 複数プロジェクトの作成、切替、削除。
- 上書き保存、Save As、未保存状態表示。
- Project JSON の import / export。
- プロジェクト単位で files、datasets、layout、plot specs、command history などを復元。

### Data Browser / Import

- `~/raw` をルートにしたファイルシステム風の Data Browser。
- ファイルのドラッグ & ドロップ、クリック選択によるアップロード。
- Upload は `upload-open` コマンド経由で Import window を開きます。
- Import window で以下を設定可能:
  - skip rows
  - delimiter
  - skip prefix
  - header row
  - raw / tabular mode
  - column name
  - column type
  - import / exclude
- Parsed preview、Raw text、Columns、Metadata をタブ表示。
- CSV / TSV / raw text の読み込み。
- EC-Lab `.mpt` と Rigaku `.ras` の簡易プリセット検出。
- Data Browser 上で dataset column の表示選択、折りたたみ、操作メニュー。

### Table

- TanStack Table + TanStack Virtual による仮想スクロール。
- DOM サイズに応じた adaptive rows 表示。
- セル選択、範囲選択、複数列選択。
- セル編集、行削除、列削除、列挿入。
- Copy TSV、selected cells clear、fill down。
- Table lock による編集禁止表示と操作制御。
- 選択列から plot を作成。
- dataset-new / dataset-calc による空 Dataset 作成と列計算。

### Plot

- uPlot ベースの line / line-marker / marker plot。
- 複数 series、色、ラベル、線幅、marker size / shape。
- title、axis label、range、tick、grid、border、font、padding、annotation。
- Plot Config window による設定編集。
- `plot-schema` による JSON schema 出力。
- `plot-apply-schema` による JSON schema 適用。
- PNG / SVG export。
- ドラッグ範囲に応じた X / Y / XY zoom。
- workspace scale 時の cursor 座標補正と高 DPI 描画補正。

### Terminal / Command History

- 初期状態で SciSpace REPL として起動。
- `help`、`file-list`、`plot`、`table-edit`、`dataset-new` などのコマンドを直接実行。
- `scispace <command>` prefix も互換的に受付。
- safe / unsafe mode 表示。
- Command History は仮想テーブル表示で、Run / Copy / To cmd line に対応。
- GUI 由来の操作も再実行可能なコマンドとして履歴化。

## 代表的な scispace コマンド

```sh
file-list ~/raw
upload-open upload-123 name=data.csv ref=upload-123 mode=tabular
import-set import-123 skipRows=1 delimiter=tab hasHeader=true
import-confirm import-123 path=~/raw/data.csv

dataset-new calc columns=x:number,y:number,label:string rows=10
dataset-calc calc column=sum expr="x + y * 2"

table waveform.csv columns=time,signal
table-edit waveform.csv action=set-cell row=1 column=signal value=3.14
table-edit waveform.csv action=insert-column column=new before=signal
table-range waveform.csv action=fill-down r1=1 c1=signal r2=10 c2=signal

plot waveform.csv x=time y=signal,background type=line-marker
plot-axis plot-1 axis=x range=auto tick=auto tickDir=out label=time
plot-grid plot-1 x=true y=true
plot-schema plot-1
plot-apply-schema plot-1 json=%7B...%7D
```

詳しいコマンド説明はアプリ内の `Help` メニューまたは `help` コマンドから確認できます。

## まだ実装できていないこと / 制約

### Workspace / UI

- Figma のような共同編集、オブジェクト編集、ページ管理は未実装です。
- ウィンドウの自動整列、スナップ、レイアウトテンプレートは未実装です。
- キーボードショートカットは一部のみ対応しています。

### Data / Import

- 対応済みの実験フォーマットは `.mpt` と `.ras` の簡易検出に限られます。
- メタデータは preview 表示中心で、Dataset の first-class metadata としてはまだ十分に扱っていません。
- 大容量ファイルはブラウザメモリと IndexedDB の制約を受けます。
- バイナリ形式、圧縮ファイル、複数ファイルをまとめた project bundle は未対応です。

### Table / Dataset

- 列計算は数値列と scalar の `+ - * /`、括弧に限定しています。
- 文字列演算、関数、条件式、欠損値処理の詳細制御は未実装です。
- Undo / Redo は主要な破壊的操作を対象にしていますが、完全な監査ログや履歴分岐はありません。

### Plot

- 1 つの plot は 1 つの Dataset を source とする設計です。複数 Dataset をまたぐ plot は未実装です。
- 第 2 Y 軸、複合軸、subplot、layout plot は未実装です。
- plot type は line / line-marker / marker が中心で、bar、heatmap、image plot、contour などは未実装です。
- PDF export は未実装です。

### Terminal / Virtual FS

- Virtual FS はアプリ内状態と IndexedDB に基づくものです。ブラウザから OS の実ファイルシステムを直接操作するものではありません。
- unsafe shell はブラウザ内の制限された shell 体験であり、ローカル OS の shell と同等ではありません。

### Packaging / Runtime

- Go バイナリは `dist/` を埋め込んでローカル HTTP サーバーとして配信します。
- 自動更新、署名、インストーラ、ネイティブファイル関連付けは未実装です。
- クラウド同期、ユーザー管理、権限管理、共同編集は未実装です。

## 開発

このプロジェクトは Vite+ を使います。基本コマンドは `vp` で実行します。

```sh
vp install
vp dev
```

`package.json` の npm scripts 経由でも実行できます。

```sh
pnpm install
pnpm dev
```

## 検証

```sh
vp check
vp test
vp test --coverage
vp build
```

## Web build

```sh
vp build
```

または:

```sh
pnpm build
```

## Go binary build

Go 実行ファイルは、ビルド済みの `dist/` を埋め込み、ローカルサーバーとして SciSpace を配信します。

```sh
pnpm binary:build
./bin/scispace
```

Windows x86_64 向け:

```sh
pnpm binary:build:windows-x64
```

デフォルトでは `http://127.0.0.1:4173/` で起動します。ポートは変更できます。

```sh
./bin/scispace --port 4183
```

## License

MIT License. See [LICENSE](./LICENSE).
