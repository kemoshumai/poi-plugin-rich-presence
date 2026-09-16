# poi-plugin-rich-presence

poi 12.0.1 で、ゲームの状態を Discord デスクトップ版の Rich Presence に表示するプラグイン。

## インストール

poi のプラグイン管理画面で `poi-plugin-rich-presence` を検索し、パッケージ名でインストールする。インストール後に poi を再起動し、設定から **Discord Rich Presence** を有効にする。

## 初期設定

1. [Discord Developer Portal](https://discord.com/developers/applications) で Discord Application を作成する。
2. Application の **General Information** にある **Application ID** をコピーする。
3. poi の設定画面で Application ID を **Client ID** に入力する。
4. **アプリ名**を必要に応じて変更する（デフォルトは `poi`）。入力欄からフォーカスを外して保存されると、実行中の Presence へ即時反映される。
5. 画像を表示する場合は、Discord の **Rich Presence > Art Assets** に登録した画像の asset key/name を入力する。asset key は英数字、`_`、`-` の128文字以内。
6. Discord デスクトップ版を起動する。

Client Secret、画像 URL、画像ファイル名は入力しない。RPC payload の `activity.name` には設定したアプリ名を送信する。ただし Discord RPC では Developer Portal の Application 名が表示に使われる場合があり、`activity.name` による表示名の上書きは保証されない。確実に表示名を変更するには Developer Portal の Application 名も変更する。

## 表示内容

- name: 設定したアプリ名（デフォルト `poi`。Discord クライアント上での上書き表示は保証されない）
- details: `母港`、`出撃中`、`戦闘中`
- state: 出撃中に海域名の表示が有効で取得できる場合は `海域 x-y`、それ以外の出撃中は `艦隊運用中`。母港と演習では送信しない
- timestamp: プラグインの読み込み時刻
- assets: 設定した asset key（任意）

Discord RPC へ送る情報は、Client ID、プロセス ID、設定したアプリ名、details/state、タイムスタンプ、設定した asset key。艦隊名、艦娘名、司令部情報、ゲーム API の生データは送信しない。

海域名表示は設定画面の **海域名を表示する** で切り替えられる。ゲームの通常出撃・連合艦隊出撃・夜戦などの戦闘 API を検出して `戦闘中` を表示する。帰港・戦果画面では戦闘表示を解除する。

## 設定の移行

設定キーは `plugin.rich-presence.discord.*`（アプリ名は `plugin.rich-presence.discord.displayName`）。旧版の `plugin.rich-presence.*` が残っている場合、プラグイン読み込み時に新しいキーへ一度だけコピーする。新しいキーが設定済みの項目は上書きしない。移行後も旧キーは削除しないため、不要なら poi の設定から削除する。

## トラブルシューティング

- 状態が「Client ID未設定」の場合は、Developer Portal の Application ID を入力する。
- Client ID の形式エラーが表示される場合は、17〜20桁の数字を入力する。
- asset error が表示される場合は、Developer Portal の **Art Assets** に存在する asset key/name と一致させる。
- Discord デスクトップ版が起動していることを確認する。ブラウザ版・モバイル版には接続しない。
- Discord を後から起動した場合は、最大30秒の段階的バックオフ後に再接続する。

Discord RPC のエラーは、接続終了（`CLOSE`）とコマンド応答（`FRAME` / `evt: ERROR`）でコード体系が異なる。

接続終了コードの扱い:

| CLOSE code | 意味 |
| ---: | --- |
| 4000 | Client ID不正 |
| 4001 | Origin不正 |
| 4002 | レート制限 |
| 4003 | トークン失効 |
| 4004 | RPCバージョン不正 |
| 4005 | エンコーディング不正 |

4002だけ長めに待機し、その他の恒久的な接続エラーは無限再試行しない。設定を修正して保存すると再試行できる。

コマンドエラーコードの表示:

| `payload.data.code` | 意味 |
| ---: | --- |
| 4000 | 不正なpayload |
| 4002 | 不正なcommand |
| 4003 | 不正なguild |
| 4004 | 不正なevent |
| 4005 | 不正なchannel |

`payload.data.message` も状態欄に表示する。接続終了コードと同じ数字でも意味は異なり、コマンドエラーでは socket を切断せず恒久的な接続エラーとして扱わない。

## アンインストール

1. poi のプラグイン管理画面で本プラグインを無効化またはアンインストールする。
2. poi を終了する。
3. poi が管理するプラグインの削除確認が必要な場合は、画面の案内に従う。
4. 不要なら `plugin.rich-presence.*` の旧設定も poi 側で削除する。

## 対応 OS と制約

Discord のローカル IPC は Discord デスクトップ版が動作している場合のみ利用できる。Windows では `discord-ipc-0`〜`discord-ipc-9` の named pipe、非 Windows ではランタイムディレクトリにある Discord IPC 候補を試行する。poi 12.0.1 の `game.response` と store API に依存する。ゲーム画面へのコード注入は行わない。

## ライセンス

MIT License。
