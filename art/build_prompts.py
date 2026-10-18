"""data/units.json から機体イラスト用の画像生成プロンプトを組み立てる。

プロンプト = 共通の画風 + 機種のシルエット + 社のデザイン言語 + 機体名のモチーフ + 構図
出力: art/prompts.json（機械用）, art/PROMPTS.md（確認用）
使い方: python3 art/build_prompts.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 全機共通。カードは小さく表示されるので、シルエットの読みやすさを最優先する。
# 数字・社名・枠はアプリ側で重ねるので、絵には文字を入れない。
# 2026-10-19 描き込みを減らす方向に変更（半写実だと小さいカードで潰れたため）
STYLE = (
    "Simple mecha illustration for a mobile card game, flat cel shading with two tones, "
    "thick clean dark outlines, limited color palette, large simple shapes, low detail, "
    "no weathering or scratches, bold silhouette that stays readable at very small size"
)
COMPOSITION = (
    "It is a machine: robotic head with a visor or mono-eye, no human face, no skin. "
    "Full body visible with margin, 3/4 front view facing left, centered, "
    "plain light gray background, no ground texture, small soft shadow, "
    "portrait 3:4. No text, no letters, no numbers, no logos, no watermark, no humans"
)

# 機種（番号）ごとのシルエット。社が違っても同じ番号は同じ役割に見えるようにする
UNIT_TYPES = {
    1: "a small unmanned reconnaissance drone hovering above the ground on ducted fans, "
       "one large sensor eye, no legs, compact body",
    2: "a light, slender bipedal scout mech in a ready-to-sprint stance, minimal armor, small rifle",
    3: "a combat engineer mech whose lower body is tank treads, with a dozer blade "
       "and multi-jointed tool arms",
    4: "an armored transport carrier on heavy tank treads, boxy hull with a large cargo bay, "
       "short manipulator arms",
    5: "a standard mainline humanoid mech with balanced proportions, holding a rifle and a shield",
    6: "an air-combat mech in flight with large wings and powerful thrusters, dynamic airborne pose",
    7: "an artillery support mech with a huge shoulder-mounted cannon and missile pods, "
       "bracing its legs",
    8: "a heavily armored bulky humanoid mech with massive shoulders and thick layered plating",
    9: "a colossal multi-legged walking fortress with turrets and a fortified superstructure, "
       "sense of enormous scale",
}

# 社ごとのデザイン言語（units.json の社の説明から）
COMPANY_STYLE = {
    "GOE": "Japanese heavy industry design: thick slab armor, samurai and castle motifs "
           "(layered lamellar plates, helmet crest), crimson red with black iron and brass trim, "
           "heavy and grounded",
    "CLD": "aerospace design: sleek lightweight frame, swept fins and thruster nozzles, "
           "white and cobalt blue paint, aircraft-like panel lines, thin armor, agile",
    "TRL": "converted construction-machinery design: hazard yellow with black stripes, "
           "exposed hydraulics and pistons, boxy off-the-shelf industrial parts, utilitarian",
    "GHC": "frontier survey design: olive green and tan, antennas and sensor arrays, "
           "rounded organic shapes, a few mismatched salvaged panels",
    "ALB": "elite knightly design: pearl white with gold trim, elegant proportions, "
           "clean precise panel lines, heraldic shapes, polished and expensive-looking",
    "NMS": "stealth private-military design: matte black faceted stealth surfaces, "
           "angular and sinister, a single dim violet sensor light, ghostly",
}

# 機体名の意味（モチーフとして軽く効かせる）
NAME_MOTIF = {
    "GOE": ["lookout tower", "foot soldier", "castle construction work", "pack-horse supply train",
            "samurai warrior", "black kite bird", "great cannon", "adamantine guardian", "castle keep"],
    "CLD": ["lark", "wren", "plover", "pelican", "hawk", "peregrine falcon", "kestrel", "condor",
            "albatross"],
    "TRL": ["pigeon", "collie dog", "beaver", "mule", "draft horse", "hornet", "rhinoceros", "bison",
            "mammoth"],
    "GHC": ["spore", "fern", "root", "tree burl", "oak", "thistle", "pine", "ironbark tree", "sequoia"],
    "ALB": ["herald", "squire", "mason", "steward", "knight", "lancer", "arbalest", "paladin", "citadel"],
    "NMS": ["will-o'-the-wisp", "shade", "grave digger", "hearse", "wraith", "banshee", "requiem",
            "revenant", "necropolis"],
}


def main() -> None:
    units = json.loads((ROOT / "data/units.json").read_text())
    types = {t["number"]: t for t in units["unitTypes"]}
    out = []
    for company in units["companies"]:
        cid = company["id"]
        for unit in company["units"]:
            n = unit["number"]
            prompt = (
                f"{STYLE}. Subject: {UNIT_TYPES[n]}. "
                f"Manufacturer style: {COMPANY_STYLE[cid]}. "
                f"Subtle design motif inspired by: {NAME_MOTIF[cid][n - 1]}. "
                f"{COMPOSITION}."
            )
            out.append({
                "model": unit["model"],
                "name": unit["name"],
                "company": company["name"],
                "type": types[n]["type"],
                "prompt": prompt,
            })

    (ROOT / "art/prompts.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")

    lines = ["# 機体イラスト用プロンプト", "",
             "`python3 art/build_prompts.py` で `data/units.json` から生成。直接編集しない。", ""]
    for p in out:
        lines += [f"## {p['model']} {p['name']}（{p['company']}／{p['type']}）", "",
                  "```", p["prompt"], "```", ""]
    (ROOT / "art/PROMPTS.md").write_text("\n".join(lines))
    print(f"{len(out)} prompts written")


if __name__ == "__main__":
    main()
