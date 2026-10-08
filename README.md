# 这是什么

将地面 tap、hold 和普通音轨上的天空 ArcTap 转换为实体 Arc 的小程序，使用 GameMaker: Studio 2 制作。

打开 `arcyconverter.yyp` 运行，选择输入的 `.aff` 文件，再选择输出文件的保存位置。

地面 tap 和天空 ArcTap 都转换为三段 Arc：默认长 25 ms 的中心 Arc，以及向左右各延伸 0.15 的两条水平 Arc。可在 `objects/Object1/Create_0.gml` 中修改 `duration`。hold 转换为覆盖原起止时间的实体 Arc。

新音符按起始时间统一配色，同时考虑原有蓝红实体 Arc 和之前生成的 Arc：当前只有蓝色 Arc 尚未结束时使用红色，只有红色 Arc 尚未结束时使用蓝色。两色均未占用或均已占用时，按横坐标选择默认颜色：`x <= 0.5` 为蓝色，其余为红色。占用区间为 `[起始时间, 结束时间)`，同一 tap 的三段 Arc 保持同色；同时开始的新音符按横坐标从左到右配色。原有实体 Arc 的颜色保持不变，音轨、绿色和灰色 Arc 不占用蓝红颜色。

ArcTap 按时间在所属音轨上计算横坐标与高度，支持 `s`、`b`、`si`、`so`、`sisi`、`siso`、`soso`、`sosi`，未知缓动按直线处理。`si`、`so` 的高度按直线计算，组合缓动分别作用于 X、Y 轴。零时长音轨使用起点坐标，反向音轨按起止时间插值。缓动公式参考 [ArcCreate 的 ArcFormula](https://github.com/Arcthesia/ArcCreate/blob/trunk/Assets/Scripts/Gameplay/Utility/ArcFormula.cs)。

每条 `arctype=true` 音轨上的多个 ArcTap 会分别转换，原音轨保留并移除 ArcTap 列表，颜色、`hitsound` 和可选 `smoothness` 参数保持原样。生成的实体 Arc 使用 `none,false`，不保留 ArcTap 的特殊打击音效或外观。`designant` 演出音轨、已有实体 Arc（包括灰色 Arc）、不带 ArcTap 的音轨及无法解析的行保持原样；列表中有无效或超出音轨时间范围的 ArcTap 时，整行保持原样。

空行不会中断读取或转换，生成的音符保留原行的缩进及所属 timinggroup。

开发验证：使用 Node.js 18 或以上版本执行 `node --test tests/aff_converter.test.cjs`。测试直接执行 GML 转换源文件，并模拟其所用的内置函数，覆盖缓动、边界、参数保留、时间占用配色、地面音符回归和读写事件链；仍需在 GameMaker 中编译运行验证。
