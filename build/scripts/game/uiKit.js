// UI-КИТ — общие элементы сцен: тексты, кнопки, крупная карта.
(function () {
    const T = (text, size, fill, opts = {}) => new PIXI.Text({
        text, style: { fontFamily: "Kereru", fontSize: size, fill, ...opts },
    });

    // Кнопка: спрайт + подпись (текст не ловит клики — eventMode none)
    function button(ctx, { tex, label, x, y, scale = 1, onTap, fontSize = 20 }) {
        const c = new PIXI.Container();
        const sp = new PIXI.Sprite(ctx.uiTex(tex));
        sp.anchor.set(0.5);
        sp.scale.set(scale);
        c.addChild(sp);
        if (label) {
            const t = T(label, fontSize, 0xf3e6c2, { stroke: { color: 0x1c1207, width: 4 } });
            t.anchor.set(0.5);
            t.eventMode = "none";
            c.addChild(t);
        }
        c.position.set(x, y);
        c.eventMode = "static";
        c.cursor = "pointer";
        c.on("pointertap", () => { if (ctx.sfx) ctx.sfx(); onTap && onTap(); });
        c.userData = { sprite: sp };
        return c;
    }

    // Крупная карта (колода/награда): рубашка + имя + стоимость + тип + описание
    function cardFace(ctx, cardId, { scale = 1, dim = false } = {}) {
        const { CARDS } = globalThis.GAME_DATA;
        const def = CARDS[cardId];
        const c = new PIXI.Container();
        const face = new PIXI.Sprite(ctx.uiTex("card_back_min.png"));
        face.anchor.set(0.5);
        if (def.type !== "unit") face.tint = def.color || 0xffffff;
        c.addChild(face);
        const plate = new PIXI.Graphics();
        plate.roundRect(-100, -140, 200, 150, 8);
        plate.fill({ color: 0x120d09, alpha: 0.72 });
        c.addChild(plate);
        const name = T(GAME_LOC.t(`card.${cardId}.name`), 20, 0xf3e6c2, { align: "center", wordWrap: true, wordWrapWidth: 190 });
        name.anchor.set(0.5, 0);
        name.position.set(0, -134);
        name.eventMode = "none";
        c.addChild(name);
        const type = T(GAME_LOC.t(`type.${def.type}`), 14, 0xcfc4a6);
        type.anchor.set(0.5, 0);
        type.position.set(0, -92);
        type.eventMode = "none";
        c.addChild(type);
        const descKey = `card.${cardId}.desc`;
        const descText = def.type === "unit"
            ? `${def.atk} ⚔   ${def.hp} ♥   ${def.speed} →`
            : GAME_LOC.t(descKey);
        const desc = T(descText, 14, 0xd8c79d, { align: "center", wordWrap: true, wordWrapWidth: 186 });
        desc.anchor.set(0.5, 0);
        desc.position.set(0, -66);
        desc.eventMode = "none";
        c.addChild(desc);
        const cost = new PIXI.Graphics();
        cost.circle(84, -146, 17);
        cost.fill(0x2f6fb0);
        cost.stroke({ width: 2.5, color: 0xbfe0ff });
        c.addChild(cost);
        const costT = T(String(def.cost), 20, 0xffffff);
        costT.anchor.set(0.5);
        costT.position.set(84, -146);
        costT.eventMode = "none";
        c.addChild(costT);
        c.scale.set(scale);
        if (dim) c.alpha = 0.45;
        return c;
    }

    // Затемнённый полноэкранный фон сцены-меню
    function dimBg(ctx, alpha = 0.78) {
        const bg = new PIXI.Sprite(ctx.uiTex("bg_corridor_1.png"));
        const s = Math.max(1280 / bg.texture.width, 720 / bg.texture.height);
        bg.scale.set(s);
        bg.position.set((1280 - bg.texture.width * s) / 2, (720 - bg.texture.height * s) / 2);
        bg.alpha = alpha;
        return bg;
    }

    globalThis.GAME_UI = { T, button, cardFace, dimBg };
})();
