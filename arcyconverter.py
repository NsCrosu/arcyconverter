#!/usr/bin/env python3
"""将 AFF 中的地面 tap、hold 和普通 ArcTap 转换为实体 Arc。

需要 Python 3.10 或以上版本，仅使用标准库。
命令行用法：python arcyconverter.py input.aff output.aff --duration 25
省略输出路径时保存为 input_arc.aff；不传参数时打开文件选择窗口。
已有输出文件需要使用 --force 覆盖，输入文件始终保留。

新音符按时间避开仍在持续的蓝红实体 Arc；无空闲颜色或两色都空闲时
按横坐标配色。同一 tap 的三段 Arc 保持同色，原有实体 Arc 保持原样。
音轨、designant、绿色和灰色 Arc 不占用蓝红颜色。
"""

from __future__ import annotations

import argparse
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path


_NUMBER = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)\Z")
_ARC = re.compile(r"arc\(([^()]*)\)(.*)\Z")
_TAP_LIST = re.compile(r"([ \t]*)\[([^\[\]]*)\]([ \t]*;.*)\Z")
_ARCTAP = re.compile(r"arctap\(([^()]*)\)\Z")
_GROUND_TAP = re.compile(r"\(([^()]*)\);\Z")
_HOLD = re.compile(r"hold\(([^()]*)\);\Z")


def _number(text: str) -> float:
    """只接受有限的十进制数，损坏的参数交由调用方保留原行。"""
    if not _NUMBER.fullmatch(text):
        raise ValueError("无效的数值参数")
    value = float(text)
    if not math.isfinite(value):
        raise ValueError("数值参数必须有限")
    return value


def _integer(text: str) -> int:
    value = _number(text)
    if not value.is_integer():
        raise ValueError("时间戳和轨道必须为整数")
    return int(value)


def _fields(text: str) -> list[str]:
    return [field.strip(" \t\r\n") for field in text.split(",")]


@dataclass(frozen=True)
class _Arc:
    start: int
    end: int
    x1: float
    x2: float
    easing: str
    y1: float
    y2: float
    color: str
    kind: str
    header: str
    tail: str


def _parse_arc(text: str) -> _Arc | None:
    match = _ARC.fullmatch(text)
    if match is None:
        return None
    fields = _fields(match[1])
    if not 9 <= len(fields) <= 11:
        return None
    try:
        return _Arc(
            _integer(fields[0]), _integer(fields[1]),
            _number(fields[2]), _number(fields[3]), fields[4],
            _number(fields[5]), _number(fields[6]), fields[7],
            fields[9] if len(fields) >= 10 else "false",
            text[:match.start(2)], match[2],
        )
    except ValueError:
        return None


def _progress(value: float, easing: str, vertical: bool) -> float:
    """单独计算两轴缓动；si、so 的高度以及未知缓动均使用直线。"""
    if easing == "b":
        return value * value * (3 - 2 * value)
    sine = {"sisi", "sosi"} if vertical else {"si", "sisi", "siso"}
    cosine = {"siso", "soso"} if vertical else {"so", "sosi", "soso"}
    if easing in sine:
        return math.sin(math.pi * value / 2)
    if easing in cosine:
        return 1 - math.cos(math.pi * value / 2)
    return value


def _make_arc(start: int, end: int, x1: float, x2: float,
              y: float, color: int, indent: str) -> str:
    return (
        f"{indent}arc({start},{end},{x1:.6f},{x2:.6f},s,"
        f"{y:.6f},{y:.6f},{color},none,false);"
    )


@dataclass
class _Note:
    start: int
    end: int
    x: float
    y: float
    indent: str
    tap: bool
    line: int
    order: int = 0
    color: int = 0

    def render(self) -> list[str]:
        center = _make_arc(self.start, self.end, self.x, self.x,
                           self.y, self.color, self.indent)
        if not self.tap:
            return [center]
        # 左右水平 Arc 只用于造型，不单独登记颜色占用。
        return [
            center,
            _make_arc(self.start, self.start, self.x, self.x - 0.15,
                      self.y, self.color, self.indent),
            _make_arc(self.start, self.start, self.x, self.x + 0.15,
                      self.y, self.color, self.indent),
        ]


def _convert_line(line: str, index: int, duration: int,
                  arc: _Arc | None) -> list[str | _Note]:
    text = line.strip(" \t")
    indent = line[:len(line) - len(line.lstrip(" \t"))]
    hold = _HOLD.fullmatch(text)
    tap = _GROUND_TAP.fullmatch(text)
    try:
        if hold is not None or tap is not None:
            match = hold if hold is not None else tap
            fields = _fields(match[1])
            if len(fields) != (3 if hold is not None else 2):
                return [line]
            start = _integer(fields[0])
            end = _integer(fields[1]) if hold is not None else start + duration
            lane = _integer(fields[-1])
            if lane not in range(1, 5) or end < start:
                return [line]
            return [_Note(start, end, lane / 2 - 0.75, 0, indent,
                          hold is None, index)]

        if arc is None or arc.kind != "true":
            return [line]
        taps = _TAP_LIST.fullmatch(arc.tail)
        if taps is None:
            return [line]
        notes = []
        for order, entry in enumerate(taps[2].split(",")):
            match = _ARCTAP.fullmatch(entry.strip(" \t"))
            if match is None:
                return [line]
            time = _integer(match[1].strip(" \t"))
            if not min(arc.start, arc.end) <= time <= max(arc.start, arc.end):
                return [line]
            # 零时长音轨取起点，反向音轨仍按起止时间插值。
            value = 0 if arc.start == arc.end else (time - arc.start) / (arc.end - arc.start)
            x = arc.x1 + (arc.x2 - arc.x1) * _progress(value, arc.easing, False)
            y = arc.y1 + (arc.y2 - arc.y1) * _progress(value, arc.easing, True)
            if not math.isfinite(x) or not math.isfinite(y):
                return [line]
            # 与实体 Arc 的输出精度一致，确保临界坐标和同时刻排序一致。
            x, y = float(f"{x:.6f}"), float(f"{y:.6f}")
            notes.append(_Note(time, time + duration, x, y, indent, True, index, order))
        # 先验证整个列表，再移除列表；原音轨的其余字段保留。
        return [indent + arc.header + taps[1] + taps[3], *notes]
    except ValueError:
        return [line]


def _assign_colors(notes: list[_Note], spans: list[tuple[int, int, int]]) -> None:
    """按时间扫描占用区间，同色 Arc 重叠时保留最晚的结束时间。"""
    spans.sort()
    notes.sort(key=lambda note: (note.start, note.x, note.line, note.order))
    ends: list[int | None] = [None, None]
    cursor = 0
    for note in notes:
        while cursor < len(spans) and spans[cursor][0] <= note.start:
            _, end, color = spans[cursor]
            ends[color] = end if ends[color] is None else max(ends[color], end)
            cursor += 1
        blue = ends[0] is not None and ends[0] > note.start
        red = ends[1] is not None and ends[1] > note.start
        note.color = 0 if note.x <= 0.5 else 1
        if blue and not red:
            note.color = 1
        elif red and not blue:
            note.color = 0
        if note.end > note.start:
            end = ends[note.color]
            ends[note.color] = note.end if end is None else max(end, note.end)


def convert_aff(text: str, duration: int = 25) -> str:
    """转换谱面文本，保留空行、缩进、文件末尾换行和可选 UTF-8 标记。"""
    if not isinstance(duration, int) or duration <= 0:
        raise ValueError("中心 Arc 的长度必须为正整数")
    bom = "\ufeff" if text.startswith("\ufeff") else ""
    body = text[len(bom):]
    newline_match = re.search(r"\r\n|\r|\n", body)
    newline = newline_match[0] if newline_match is not None else "\n"
    rows: list[list[str | _Note]] = []
    notes: list[_Note] = []
    spans: list[tuple[int, int, int]] = []
    for index, line in enumerate(re.split(r"\r\n|\r|\n", body)):
        arc = _parse_arc(line.strip(" \t"))
        if arc is not None and arc.kind not in {"true", "designant"} and arc.start < arc.end:
            try:
                color = _number(arc.color)
                if color in (0, 1):
                    spans.append((arc.start, arc.end, int(color)))
            except ValueError:
                pass
        parts = _convert_line(line, index, duration, arc)
        rows.append(parts)
        notes.extend(part for part in parts if isinstance(part, _Note))
    _assign_colors(notes, spans)
    output = []
    for row in rows:
        for part in row:
            output.extend(part.render() if isinstance(part, _Note) else [part])
    return bom + newline.join(output)


def convert_file(source: Path | str, destination: Path | str,
                 duration: int = 25, overwrite: bool = False) -> Path:
    """读取 UTF-8 谱面并保存转换结果，默认不覆盖已有输出文件。"""
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve():
        raise ValueError("输出路径不能与输入路径相同")
    if destination.exists() and source.samefile(destination):
        raise ValueError("输出文件不能指向输入文件")
    with source.open("r", encoding="utf-8", newline="") as handle:
        converted = convert_aff(handle.read(), duration)
    with destination.open("w" if overwrite else "x", encoding="utf-8", newline="") as handle:
        handle.write(converted)
    return destination


def _choose_files() -> tuple[Path, Path] | None:
    """仅交互模式需要 Tk；命令行模式可以在没有图形界面的环境运行。"""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError as error:
        raise RuntimeError("未安装 Tkinter，请通过命令行指定输入和输出文件") from error
    try:
        root = tk.Tk()
    except tk.TclError as error:
        raise RuntimeError("无法打开图形界面，请通过命令行指定输入和输出文件") from error
    root.withdraw()
    try:
        source = filedialog.askopenfilename(
            title="选择输入的 AFF 谱面", filetypes=[("AFF 谱面", "*.aff"), ("所有文件", "*")],
        )
        if not source:
            return None
        path = Path(source)
        destination = filedialog.asksaveasfilename(
            title="保存转换后的 AFF 谱面", initialdir=str(path.parent),
            initialfile=f"{path.stem}_arc.aff", defaultextension=".aff",
            filetypes=[("AFF 谱面", "*.aff"), ("所有文件", "*")], confirmoverwrite=True,
        )
        return (path, Path(destination)) if destination else None
    finally:
        root.destroy()


def _positive_int(text: str) -> int:
    try:
        value = int(text)
    except ValueError as error:
        raise argparse.ArgumentTypeError("请输入正整数") from error
    if value <= 0:
        raise argparse.ArgumentTypeError("请输入正整数")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", nargs="?", type=Path, help="输入的 AFF 文件；省略时打开文件选择窗口")
    parser.add_argument("output", nargs="?", type=Path, help="输出文件；默认在输入文件名后加 _arc")
    parser.add_argument("--duration", type=_positive_int, default=25, help="中心 Arc 的长度，单位毫秒，默认 25")
    parser.add_argument("--force", action="store_true", help="允许覆盖已有输出文件")
    args = parser.parse_args(argv)
    try:
        if args.input is None:
            paths = _choose_files()
            if paths is None:
                return 0
            source, destination = paths
            overwrite = True
        else:
            source = args.input
            destination = args.output or source.with_name(f"{source.stem}_arc.aff")
            overwrite = args.force
        output = convert_file(source, destination, args.duration, overwrite)
    except FileExistsError:
        print("输出文件已存在，请选择其他路径或使用 --force 覆盖", file=sys.stderr)
        return 1
    except (OSError, UnicodeError, ValueError, RuntimeError) as error:
        print(f"转换失败：{error}", file=sys.stderr)
        return 1
    print(f"转换完成：{output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
