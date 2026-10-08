const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/aff_converter/aff_converter.gml'), 'utf8');

// 转换脚本使用与 JavaScript 共通的 GML 语法，直接执行源文件，避免复制待测算法。
// 这里只模拟所用的 GML 内置函数，不能代替 GameMaker 编译和运行验证。
function runtime(extra = {}) {
  const context = vm.createContext({
    string_length: text => text.length,
    string_char_at: (text, index) => text[index - 1] ?? '',
    string_copy: (text, start, count) => text.slice(Math.max(0, start - 1), Math.max(0, start - 1) + Math.max(0, count)),
    string_delete: (text, start, count) => text.slice(0, start - 1) + text.slice(start - 1 + count),
    string_pos: (needle, text) => needle === '' ? 0 : text.indexOf(needle) + 1,
    string_pos_ext: (needle, text, start) => needle === '' ? 0 : text.indexOf(needle, start - 1) + 1,
    array_length: array => array.length,
    array_sort: (array, compare) => { array.sort(compare); },
    string: String,
    string_format: (value, width, decimals) => value.toFixed(decimals).padStart(width, ' '),
    real: text => {
      const value = Number(text);
      assert.ok(text.trim() !== '' && Number.isFinite(value), `无效数值：${text}`);
      return value;
    },
    floor: Math.floor,
    sign: Math.sign,
    min: Math.min,
    max: Math.max,
    sin: Math.sin,
    cos: Math.cos,
    pi: Math.PI,
    ...extra,
  });
  vm.runInContext(source, context, { filename: 'aff_converter.gml' });
  return context;
}

const converter = runtime();

function arcs(text) {
  return text.split(/\r?\n/).map(line => {
    const match = line.trim().match(/^arc\(([^)]+)\);$/);
    assert.ok(match, `不是有效的 Arc 行：${line}`);
    const fields = match[1].split(',').map(field => field.trim());
    assert.ok(fields.length === 10 || fields.length === 11);
    return {
      start: Number(fields[0]), end: Number(fields[1]),
      x1: Number(fields[2]), x2: Number(fields[3]),
      easing: fields[4], y1: Number(fields[5]), y2: Number(fields[6]),
      color: Number(fields[7]), hitsound: fields[8], type: fields[9],
    };
  });
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 0.00000051, `${actual} 与 ${expected} 不一致`);
}

function tapShape(notes, time, x, y, color, duration = 25) {
  assert.equal(notes.length, 3);
  for (const note of notes) {
    assert.equal(note.start, time);
    close(note.x1, x);
    close(note.y1, y);
    close(note.y2, y);
    assert.equal(note.color, color);
    assert.equal(note.easing, 's');
    assert.equal(note.hitsound, 'none');
    assert.equal(note.type, 'false');
  }
  assert.equal(notes[0].end, time + duration);
  close(notes[0].x2, x);
  assert.equal(notes[1].end, time);
  assert.equal(notes[2].end, time);
  close(notes[1].x2, x - 0.15);
  close(notes[2].x2, x + 0.15);
}

// 使用非中点处的独立预期值，区分直线、贝塞尔以及两个正弦方向。
const easingCases = [
  ['s', 0.25, 0.25],
  ['b', 0.15625, 0.15625],
  ['si', 0.3826834323650898, 0.25],
  ['so', 0.07612046748871326, 0.25],
  ['sisi', 0.3826834323650898, 0.3826834323650898],
  ['siso', 0.3826834323650898, 0.07612046748871326],
  ['soso', 0.07612046748871326, 0.07612046748871326],
  ['sosi', 0.07612046748871326, 0.3826834323650898],
  ['unknown', 0.25, 0.25],
];

for (const [easing, px, py] of easingCases) {
  test(`${easing} 缓动分别计算两轴坐标`, () => {
    const trace = `arc(1000,2000,-0.25,1.25,${easing},0.1,0.9,2,none,true)`;
    const converted = converter.aff_convert_arctaps(`${trace}[arctap(1250)];`, 25);
    assert.equal(converted.split('\r\n')[0], `${trace};`);
    tapShape(arcs(converted).slice(1), 1250, -0.25 + 1.5 * px, 0.1 + 0.8 * py, 0);
  });
}

test('多个 ArcTap、两端边界和左右配色', () => {
  const converted = converter.aff_convert_arctaps(
    'arc(1000,2000,0,1,s,0.25,1,0,none,true)[arctap(1000),arctap(1500),arctap(2000)];', 25,
  );
  const notes = arcs(converted).slice(1);
  assert.equal(notes.length, 9);
  tapShape(notes.slice(0, 3), 1000, 0, 0.25, 0);
  tapShape(notes.slice(3, 6), 1500, 0.5, 0.625, 0);
  tapShape(notes.slice(6, 9), 2000, 1, 1, 1);
});

test('可选 smoothness、音效、颜色与 timinggroup 缩进保留', () => {
  const trace = '\t  arc(1000,2000,0,1,siso,0,1,3,glass_wav,true,2.5)';
  const converted = converter.aff_convert_arctaps(`${trace}[ arctap( 1250 ), arctap(1750) ];`, 25);
  const lines = converted.split('\r\n');
  assert.equal(lines[0], `${trace};`);
  assert.equal(lines.length, 7);
  assert.ok(lines.every(line => line.startsWith('\t  arc(')));
  assert.ok(!converted.includes('arctap('));
  tapShape(arcs(converted).slice(4), 1750, 0.9238795325112867, 0.6173165676349102, 1);
});

test('零时长音轨使用起点坐标', () => {
  const converted = converter.aff_convert_arctaps(
    'arc(1000,1000,0.2,0.9,b,0.3,0.8,0,none,true)[arctap(1000)];', 25,
  );
  tapShape(arcs(converted).slice(1), 1000, 0.2, 0.3, 0);
  assert.ok(!/NaN|Infinity/.test(converted));
});

test('反向音轨按时间方向插值', () => {
  const converted = converter.aff_convert_arctaps(
    'arc(2000,1000,0,1,s,0,1,1,none,true)[arctap(1250),arctap(2000)];', 25,
  );
  const notes = arcs(converted).slice(1);
  tapShape(notes.slice(0, 3), 1250, 0.75, 0.75, 1);
  tapShape(notes.slice(3, 6), 2000, 0, 0, 0);
});

test('负时间、越界坐标与自定义中心 Arc 长度', () => {
  const converted = converter.aff_convert_arctaps(
    'arc(-100,100,-1,2,s,-0.5,1.5,0,none,true)[arctap(-50)];', 40,
  );
  tapShape(arcs(converted).slice(1), -50, -0.25, 0, 0, 40);
});

const unchangedCases = [
  '', '   ', 'AudioOffset:0', '-', 'timinggroup(noinput){', '};', 'timing(0,120,4);',
  'arc(1000,2000,0,1,s,0,1,0,none,true);',
  'arc(1000,2000,0,1,s,0,1,0,none,true)[];',
  'arc(1000,2000,0,1,s,0,1,0,none,false)[arctap(1500)];',
  'arc(1000,2000,0,1,s,0,1,0,none,designant)[arctap(1500)];',
  'arc(1000,2000,0,1,s,0,1,0,none,other)[arctap(1500)];',
  'arc(1000,2000,0,1,s,0,1,0,none)[arctap(1500)];',
  'arc(1000,2000,0,1,s,0,1,0,none,true)[arctap(999)];',
  'arc(1000,2000,0,1,s,0,1,0,none,true)[arctap(1500),arctap(2001)];',
  'arc(1000,2000,0,1,s,0,1,0,none,true)[arctap(1500.5)];',
  'arc(1000,2000,0,1,s,0,1,0,none,true)[arctap(bad)];',
  'arc(1000,2000,0,1,s,0,1,0,none,true)[arctap()];',
  'arc(1000,2000,0,1,s,0,1,0,none,true)[arctap(1500),];',
  'arc(1000,2000,0,1,s,0,1,0,none,true)[other(1500)];',
  'arc(1000,2000,0,1,s,0,1,0,none,true)[arctap(1500);',
  'arc(1000,2000,0,1,s,0,1,0,none,true)[arctap(1500)]',
  'arc(1000,2000,bad,1,s,0,1,0,none,true)[arctap(1500)];',
  'arc(1000.5,2000,0,1,s,0,1,0,none,true)[arctap(1500)];',
  'arc(1000,2000,0,1,s,0,1,0,none,true,2,extra)[arctap(1500)];',
];

for (const [index, line] of unchangedCases.entries()) {
  test(`非目标或无效行保持原样 ${index + 1}`, () => {
    assert.equal(converter.aff_convert_arctaps(line, 25), line);
  });
}

for (let lane = 1; lane <= 4; lane++) {
  test(`地面第 ${lane} 轨 tap 和 hold 回归`, () => {
    tapShape(arcs(converter.aff_convert_tap(`  (1000,${lane});`, 25)), 1000, lane / 2 - 0.75, 0, lane <= 2 ? 0 : 1);
    const [hold] = arcs(converter.aff_convert_hold(`\thold(1000,2000,${lane});`));
    assert.equal(hold.start, 1000);
    assert.equal(hold.end, 2000);
    assert.equal(hold.x1, lane / 2 - 0.75);
    assert.equal(hold.x2, hold.x1);
    assert.equal(hold.y1, 0);
    assert.equal(hold.y2, 0);
    assert.equal(hold.color, lane <= 2 ? 0 : 1);
    assert.equal(hold.type, 'false');
  });
}

function colorChart(lines, duration = 25) {
  const converted = lines.map(line => converter.aff_convert_arctaps(
    converter.aff_convert_tap(converter.aff_convert_hold(line), duration), duration,
  ));
  return Array.from(converter.aff_assign_colors(lines, converted));
}

for (const occupied of [0, 1]) {
  const lane = occupied === 0 ? 1 : 4;
  const x = lane / 2 - 0.75;
  const original = `arc(1000,2000,0,1,s,0,1,${occupied},none,false);`;
  test(`已有${occupied === 0 ? '蓝色' : '红色'} Arc 时，地面 tap 使用另一色`, () => {
    const output = colorChart([original, `(1500,${lane});`]);
    assert.equal(output[0], original);
    tapShape(arcs(output[1]), 1500, x, 0, 1 - occupied);
  });
  test(`已有${occupied === 0 ? '蓝色' : '红色'} Arc 时，hold 使用另一色`, () => {
    const output = colorChart([original, `hold(1500,2500,${lane});`]);
    assert.equal(output[0], original);
    const [hold] = arcs(output[1]);
    assert.equal(hold.color, 1 - occupied);
    assert.equal(hold.start, 1500);
    assert.equal(hold.end, 2500);
    close(hold.x1, x);
    close(hold.x2, x);
  });
  test(`已有${occupied === 0 ? '蓝色' : '红色'} Arc 时，ArcTap 使用另一色`, () => {
    const trace = `arc(1000,2000,${x},${x},s,0.5,0.5,0,none,true)`;
    const output = colorChart([original, `${trace}[arctap(1500)];`]);
    assert.equal(output[0], original);
    assert.equal(output[1].split('\r\n')[0], `${trace};`);
    tapShape(arcs(output[1]).slice(1), 1500, x, 0.5, 1 - occupied);
  });
}

for (const [time, color] of [[999, 0], [1000, 1], [1999, 1], [2000, 0], [2001, 0]]) {
  test(`已有 Arc 的颜色占用边界 ${time}`, () => {
    const original = 'arc(1000,2000,0,1,s,0,1,0,none,false);';
    const output = colorChart([`(${time},1);`, original]);
    tapShape(arcs(output[0]), time, -0.25, 0, color);
    assert.equal(output[1], original);
  });
}

test('两个同色 Arc 重叠时，较短 Arc 结束不释放仍被占用的颜色', () => {
  const sources = [
    'arc(1000,3000,0,1,s,0,1,0,none,false);',
    'arc(1500,1800,1,0,s,1,0,0,none,false);',
    '(1900,1);',
  ];
  const output = colorChart(sources);
  assert.deepEqual(output.slice(0, 2), sources.slice(0, 2));
  tapShape(arcs(output[2]), 1900, -0.25, 0, 1);
});

test('未来的原有 Arc 不影响当前配色', () => {
  const output = colorChart(['arc(2000,3000,0,1,s,0,1,0,none,false);', '(1000,1);']);
  tapShape(arcs(output[1]), 1000, -0.25, 0, 0);
});

test('两色同时占用时，回退到左右默认色', () => {
  const originals = [
    'arc(1000,2000,0,1,s,0,1,0,none,false);',
    'arc(1000,2000,1,0,s,1,0,1,none,false);',
  ];
  const output = colorChart([...originals, '(1500,1);', '(1500,4);']);
  assert.deepEqual(output.slice(0, 2), originals);
  tapShape(arcs(output[2]), 1500, -0.25, 0, 0);
  tapShape(arcs(output[3]), 1500, 1.25, 0, 1);
});

for (const original of [
  'arc(1000,2000,0,1,s,0,1,0,none,true);',
  'arc(1000,2000,0,1,s,0,1,0,none,designant);',
  'arc(1000,2000,0,1,s,0,1,2,none,false);',
  'arc(1000,2000,0,1,s,0,1,3,none,false);',
  'arc(1500,1500,0,1,s,0,1,0,none,false);',
  'arc(1000,2000,bad,1,s,0,1,0,none,false);',
]) {
  test(`非占用 Arc 不干扰配色：${original}`, () => {
    const output = colorChart([original, '(1500,1);']);
    assert.equal(output[0], original);
    tapShape(arcs(output[1]), 1500, -0.25, 0, 0);
  });
}

for (const type of ['', ',other']) {
  test(`缺失或无效 arctype 按实体 Arc 计入颜色占用：${type}`, () => {
    const original = `arc(1000,2000,0,1,s,0,1,0,none${type});`;
    const output = colorChart([original, '(1500,1);']);
    assert.equal(output[0], original);
    tapShape(arcs(output[1]), 1500, -0.25, 0, 1);
  });
}

test('重新配色后的 hold 继续占用实际生成的颜色', () => {
  const output = colorChart([
    'arc(1000,1050,0,1,s,0,1,0,none,false);',
    'hold(1040,1500,1);',
    '(1200,4);',
  ]);
  assert.equal(arcs(output[1])[0].color, 1);
  tapShape(arcs(output[2]), 1200, 1.25, 0, 0);
});

test('地面 tap 的短中心 Arc 占用颜色，三段 Arc 保持同色', () => {
  const output = colorChart(['(1000,1);', '(1010,1);', '(1035,1);']);
  tapShape(arcs(output[0]), 1000, -0.25, 0, 0);
  tapShape(arcs(output[1]), 1010, -0.25, 0, 1);
  tapShape(arcs(output[2]), 1035, -0.25, 0, 0);
});

test('跨音符类型、无序谱面行按实际时间配色', () => {
  const output = colorChart([
    'hold(1010,2000,1);',
    '(1100,4);',
    'arc(1000,1500,0,0,s,0.5,0.5,1,glass_wav,true,2)[arctap(1000)];',
  ]);
  assert.equal(arcs(output[0])[0].color, 1);
  tapShape(arcs(output[1]), 1100, 1.25, 0, 0);
  tapShape(arcs(output[2]).slice(1), 1000, 0, 0.5, 0);
});

test('同一音轨中无序的 ArcTap 列表按实际时间配色', () => {
  const output = colorChart(['arc(1000,2000,0,0,s,0.5,0.5,0,none,true)[arctap(1010),arctap(1000),arctap(1050)];']);
  const notes = arcs(output[0]).slice(1);
  tapShape(notes.slice(0, 3), 1010, 0, 0.5, 1);
  tapShape(notes.slice(3, 6), 1000, 0, 0.5, 0);
  tapShape(notes.slice(6, 9), 1050, 0, 0.5, 0);
});

test('同时生成的新音符从左到右分配颜色，保留原输出顺序', () => {
  const output = colorChart(['(1000,2);', '(1000,1);']);
  tapShape(arcs(output[0]), 1000, 0.25, 0, 1);
  tapShape(arcs(output[1]), 1000, -0.25, 0, 0);
});

test('负时间下不会出现虚假的默认颜色占用', () => {
  const output = colorChart(['(-100,1);', 'hold(-90,100,1);', '(-50,4);']);
  tapShape(arcs(output[0]), -100, -0.25, 0, 0);
  assert.equal(arcs(output[1])[0].color, 1);
  tapShape(arcs(output[2]), -50, 1.25, 0, 0);
});

test('完整事件链读取、转换和保存空行后的音符', () => {
  const input = fs.readFileSync(path.join(__dirname, 'fixtures/arctaps.aff'), 'utf8').split(/\r?\n/);
  if (input.at(-1) === '') input.pop();
  let position = 0;
  let output = '';
  const closed = [];
  let ended = false;
  const context = runtime({
    alarm: Array(12).fill(-1),
    draw_enable_drawevent: () => {},
    get_open_filename: () => 'input.aff',
    get_save_filename: () => 'output.aff',
    file_text_open_read: () => 'input',
    file_text_eof: () => position >= input.length,
    file_text_read_string: () => input[position],
    file_text_readln: () => { position++; },
    file_text_open_write: () => 'output',
    file_text_write_string: (_file, text) => { output += text; },
    file_text_writeln: () => { output += '\r\n'; },
    file_text_close: file => { closed.push(file); },
    game_end: () => { ended = true; },
  });

  function event(filename) {
    const code = fs.readFileSync(path.join(root, 'objects/Object1', filename), 'utf8');
    // 将 GML 的事件退出映射为函数返回，其余事件代码直接执行。
    vm.runInContext(`(function () {\n${code.replace(/\bexit;/g, 'return;')}\n})();`, context, { filename });
  }

  event('Create_0.gml');
  assert.equal(context.aff_line_count, input.length);
  assert.equal(context.alarm[0], 1);
  assert.deepEqual(Array.from(context.aff_color_sources), input);
  assert.deepEqual(closed, ['input']);
  for (let index = 0; index <= 3; index++) {
    event(`Alarm_${index}.gml`);
    if (index < 3) assert.equal(context.alarm[index + 1], 1);
  }
  assert.deepEqual(closed, ['input', 'output']);
  assert.equal(ended, true);
  assert.ok(output.startsWith('AudioOffset:0\r\nTimingPointDensityFactor:1\r\n-\r\n\r\n'));
  assert.ok(output.includes('timinggroup(noinput){\r\n'));
  assert.ok(output.includes('\r\n\r\n\tarc(2500,3500,'));
  assert.ok(output.endsWith('};\r\n'));
  assert.ok(!output.includes('hold('));
  assert.ok(!/^\s*\(/m.test(output));
  assert.equal((output.match(/arctap\(/g) ?? []).length, 1);
  assert.ok(output.includes('arc(4000,5000,0,1,s,0,1,0,none,designant)[arctap(4500)];'));
  assert.ok(output.includes('arc(3000,3000,0,1,s,1,1,3,none,false);'));
  const entities = output.split(/\r?\n/).filter(line => /,none,false\);$/.test(line));
  assert.equal(entities.length, 20);
  tapShape(arcs(context.aff[7]).slice(1, 4), 1000, 0, 0.25, 1);

  // 再次转换应保持结果不变，避免残留 ArcTap 或重复追加实体 Arc。
  for (const line of output.split(/\r?\n/)) {
    const converted = context.aff_convert_arctaps(context.aff_convert_tap(context.aff_convert_hold(line), 25), 25);
    assert.equal(converted, line);
  }
});

test('项目注册转换脚本及完整的 Alarm 事件链', () => {
  const json = filename => JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8').replace(/,\s*([}\]])/g, '$1'));
  const project = json('arcyconverter.yyp');
  assert.ok(project.resources.some(resource => resource.id.path === 'scripts/aff_converter/aff_converter.yy'));
  for (const resource of project.resources) {
    assert.ok(fs.existsSync(path.join(root, resource.id.path)));
  }
  assert.equal(json('scripts/aff_converter/aff_converter.yy').resourceType, 'GMScript');
  const alarms = json('objects/Object1/Object1.yy').eventList.filter(event => event.eventType === 2);
  assert.deepEqual(alarms.map(event => event.eventNum).sort(), [0, 1, 2, 3]);
});
