# メカ・バトルライン（Web仮組み）

ルールの確認用のWeb版。最終的なネイティブアプリ（Expo想定）へは `src/game/` をそのまま持っていく。

公開版：https://takumifunasaka.github.io/mech-battleline/ （`main` に push すると GitHub Actions がテスト・ビルドして自動で更新する）

- 共有山札版（正式仕様 `docs/SPEC.md`）：https://takumifunasaka.github.io/mech-battleline/
- デッキ制の試作（`docs/SPEC_DECK.md`）：https://takumifunasaka.github.io/mech-battleline/deck/ （ローカルでは http://localhost:5173/deck/）

```sh
npm install
npm run dev     # http://localhost:5173 。同じWi-Fiのスマホからは表示される Network のURLで開く
npm test        # ルール判定のユニットテスト
```

## 構成

- `src/game/` — ゲームロジック（UIに依存しない純粋なTS。状態 + アクション → 新しい状態）
  - `config.ts` — バランスに関わる定数はすべてここ
  - `evaluate.ts` — 役の評価、到達可能な最良の編成（証明による確保・CPUで使用）
  - `engine.ts` — 準備・配備・決着・勝利判定・補充・パス
  - `cpu.ts` — SPEC 第7節のヒューリスティック（`reference/sim/sim3.py` と同じ評価）
- `src/ui/` — React の画面（仮組み。ネイティブ化の際は作り直す前提）

## 確認用URL

`?mode=cpu&seed=123` でそのシードのゲームを開始。`&moves=20` を付けると最初の20手をCPU同士で進める（`mode=local` で2人対戦）。終了画面と履歴にシードが出るので、気になった展開の再現に使える。
