///@desc 去除参数两端的空白，兼容旧版 GameMaker
function aff_trim(_text) {
	var _start = 1;
	var _end = string_length(_text);
	while (_start <= _end && string_pos(string_char_at(_text, _start), " \t\r\n") > 0) {
		_start++;
	}
	while (_end >= _start && string_pos(string_char_at(_text, _end), " \t\r\n") > 0) {
		_end--;
	}
	return string_copy(_text, _start, _end - _start + 1);
}

///@desc 保留 timinggroup 内音符的缩进
function aff_indent(_line) {
	var _length = 0;
	while (_length < string_length(_line) && string_pos(string_char_at(_line, _length + 1), " \t") > 0) {
		_length++;
	}
	return string_copy(_line, 1, _length);
}

///@desc 按逗号拆分 AFF 参数
function aff_fields(_text) {
	var _fields = [];
	var _start = 1;
	var _comma = string_pos_ext(",", _text, _start);
	while (_comma > 0) {
		_fields[array_length(_fields)] = aff_trim(string_copy(_text, _start, _comma - _start));
		_start = _comma + 1;
		_comma = string_pos_ext(",", _text, _start);
	}
	_fields[array_length(_fields)] = aff_trim(string_copy(_text, _start, string_length(_text) - _start + 1));
	return _fields;
}

///@desc 检查数值，避免损坏的谱面参数导致 real 转换报错
function aff_is_number(_text) {
	var _length = string_length(_text);
	var _start = 1;
	var _digits = 0;
	var _dots = 0;
	if (string_char_at(_text, 1) == "+" || string_char_at(_text, 1) == "-") {
		_start++;
	}
	for (var _i = _start; _i <= _length; _i++) {
		var _char = string_char_at(_text, _i);
		if (_char == ".") {
			_dots++;
		} else if (string_pos(_char, "0123456789") > 0) {
			_digits++;
		} else {
			return false;
		}
	}
	return _digits > 0 && _dots <= 1;
}

///@desc 生成实体 Arc，保留六位小数以减少缓动坐标的精度损失
function aff_make_arc(_start, _end, _x1, _x2, _y1, _y2, _color) {
	return "arc(" + string(_start) + "," + string(_end) + ","
		+ string_format(_x1, 0, 6) + "," + string_format(_x2, 0, 6) + ",s,"
		+ string_format(_y1, 0, 6) + "," + string_format(_y2, 0, 6) + ","
		+ string(_color) + ",none,false);";
}

///@desc 用三段 Arc 组成 tap，先按左右设置默认颜色，再统一根据时间占用调整
function aff_tap_arcs(_time, _x, _y, _duration, _indent) {
	var _color = (_x <= 0.5) ? 0 : 1;
	return _indent + aff_make_arc(_time, _time + _duration, _x, _x, _y, _y, _color) + "\r\n"
		+ _indent + aff_make_arc(_time, _time, _x, _x - 0.15, _y, _y, _color) + "\r\n"
		+ _indent + aff_make_arc(_time, _time, _x, _x + 0.15, _y, _y, _color);
}

///@desc 将地面 hold 转换为同位置的实体 Arc
function aff_convert_hold(_line) {
	var _text = aff_trim(_line);
	if (string_copy(_text, 1, 5) != "hold(") {
		return _line;
	}
	var _end = string_pos(")", _text);
	if (_end == 0) {
		return _line;
	}
	var _fields = aff_fields(string_copy(_text, 6, _end - 6));
	if (array_length(_fields) != 3) {
		return _line;
	}
	for (var _i = 0; _i < 3; _i++) {
		if (!aff_is_number(_fields[_i])) {
			return _line;
		}
	}
	var _start = real(_fields[0]);
	var _finish = real(_fields[1]);
	var _lane = real(_fields[2]);
	if (_start != floor(_start) || _finish != floor(_finish) || _start > _finish
		|| _lane != floor(_lane) || _lane < 1 || _lane > 4) {
		return _line;
	}
	var _x = _lane / 2 - 0.75;
	return aff_indent(_line) + aff_make_arc(_start, _finish, _x, _x, 0, 0, (_lane <= 2) ? 0 : 1);
}

///@desc 将地面 tap 转换为三段 Arc
function aff_convert_tap(_line, _duration) {
	var _text = aff_trim(_line);
	if (string_char_at(_text, 1) != "(") {
		return _line;
	}
	var _end = string_pos(")", _text);
	if (_end == 0) {
		return _line;
	}
	var _fields = aff_fields(string_copy(_text, 2, _end - 2));
	if (array_length(_fields) != 2) {
		return _line;
	}
	if (!aff_is_number(_fields[0]) || !aff_is_number(_fields[1])) {
		return _line;
	}
	var _time = real(_fields[0]);
	var _lane = real(_fields[1]);
	if (_time != floor(_time) || _lane != floor(_lane) || _lane < 1 || _lane > 4) {
		return _line;
	}
	return aff_tap_arcs(_time, _lane / 2 - 0.75, 0, _duration, aff_indent(_line));
}

///@desc 计算单个坐标轴的缓动比例，未知类型按直线处理
function aff_arc_progress(_progress, _easing, _vertical) {
	if (_easing == "b") {
		return _progress * _progress * (3 - 2 * _progress);
	}
	if (_vertical) {
		switch (_easing) {
			case "sisi":
			case "sosi":
				return sin(pi * _progress / 2);
			case "siso":
			case "soso":
				return 1 - cos(pi * _progress / 2);
		}
	} else {
		switch (_easing) {
			case "si":
			case "sisi":
			case "siso":
				return sin(pi * _progress / 2);
			case "so":
			case "sosi":
			case "soso":
				return 1 - cos(pi * _progress / 2);
		}
	}
	return _progress;
}

///@desc 将普通音轨上的所有 ArcTap 转换为实体 Arc，保留原音轨参数
function aff_convert_arctaps(_line, _duration) {
	var _text = aff_trim(_line);
	if (string_copy(_text, 1, 4) != "arc(") {
		return _line;
	}
	var _arc_end = string_pos(")", _text);
	var _list_start = string_pos("[", _text);
	var _list_end = string_pos("]", _text);
	if (_arc_end == 0 || _list_start <= _arc_end || _list_end <= _list_start
		|| aff_trim(string_copy(_text, _arc_end + 1, _list_start - _arc_end - 1)) != "") {
		return _line;
	}
	var _suffix = aff_trim(string_copy(_text, _list_end + 1, string_length(_text) - _list_end));
	if (string_char_at(_suffix, 1) != ";") {
		return _line;
	}
	var _fields = aff_fields(string_copy(_text, 5, _arc_end - 5));
	var _count = array_length(_fields);
	// designant 音符不计入 Combo，保留其演出用途；缺失或无效类型也不转换
	if (_count != 10 && _count != 11) {
		return _line;
	}
	if (_fields[9] != "true") {
		return _line;
	}
	for (var _i = 0; _i < 7; _i++) {
		if (_i != 4 && !aff_is_number(_fields[_i])) {
			return _line;
		}
	}
	var _start = real(_fields[0]);
	var _finish = real(_fields[1]);
	if (_start != floor(_start) || _finish != floor(_finish)) {
		return _line;
	}
	var _x1 = real(_fields[2]);
	var _x2 = real(_fields[3]);
	var _y1 = real(_fields[5]);
	var _y2 = real(_fields[6]);
	var _entries = aff_fields(string_copy(_text, _list_start + 1, _list_end - _list_start - 1));
	var _indent = aff_indent(_line);
	var _converted = "";
	for (var _i = 0; _i < array_length(_entries); _i++) {
		var _entry = _entries[_i];
		var _length = string_length(_entry);
		if (string_copy(_entry, 1, 7) != "arctap(" || string_char_at(_entry, _length) != ")") {
			return _line;
		}
		var _time_text = aff_trim(string_copy(_entry, 8, _length - 8));
		if (!aff_is_number(_time_text)) {
			return _line;
		}
		var _time = real(_time_text);
		if (_time != floor(_time) || _time < min(_start, _finish) || _time > max(_start, _finish)) {
			return _line;
		}
		// 零时长音轨使用起点坐标，避免除以零；反向音轨仍按起止时间插值
		var _progress = (_start == _finish) ? 0 : (_time - _start) / (_finish - _start);
		var _x = _x1 + (_x2 - _x1) * aff_arc_progress(_progress, _fields[4], false);
		var _y = _y1 + (_y2 - _y1) * aff_arc_progress(_progress, _fields[4], true);
		_converted += "\r\n" + aff_tap_arcs(_time, _x, _y, _duration, _indent);
	}
	// 仅移除 ArcTap 列表，原音轨的颜色、音效、类型和平滑度都保持原样
	return _indent + string_delete(_text, _list_start, _list_end - _list_start + 1) + _converted;
}

///@desc 提取实体 Arc 的参数，音轨和无法解析的 Arc 不参与颜色占用
function aff_solid_arc_fields(_line) {
	var _text = aff_trim(_line);
	if (string_copy(_text, 1, 4) != "arc(") {
		return [];
	}
	var _end = string_pos(")", _text);
	if (_end == 0) {
		return [];
	}
	var _fields = aff_fields(string_copy(_text, 5, _end - 5));
	var _count = array_length(_fields);
	if (_count < 9 || _count > 11) {
		return [];
	}
	if (_count >= 10) {
		if (_fields[9] == "true" || _fields[9] == "designant") {
			return [];
		}
	}
	for (var _i = 0; _i < 8; _i++) {
		if (_i != 4 && !aff_is_number(_fields[_i])) {
			return [];
		}
	}
	var _start = real(_fields[0]);
	var _finish = real(_fields[1]);
	if (_start != floor(_start) || _finish != floor(_finish) || _start > _finish) {
		return [];
	}
	return _fields;
}

///@desc 拆分转换后同一原始行中生成的多条 Arc
function aff_generated_lines(_text) {
	var _lines = [];
	var _start = 1;
	var _break = string_pos_ext("\r\n", _text, _start);
	while (_break > 0) {
		_lines[array_length(_lines)] = string_copy(_text, _start, _break - _start);
		_start = _break + 2;
		_break = string_pos_ext("\r\n", _text, _start);
	}
	_lines[array_length(_lines)] = string_copy(_text, _start, string_length(_text) - _start + 1);
	return _lines;
}

///@desc 只替换生成的 Arc 的颜色字段，保留其余参数和缩进
function aff_set_arc_color(_line, _color) {
	var _start = string_pos("(", _line) + 1;
	for (var _i = 0; _i < 7; _i++) {
		_start = string_pos_ext(",", _line, _start) + 1;
	}
	var _end = string_pos_ext(",", _line, _start);
	return string_copy(_line, 1, _start - 1) + string(_color)
		+ string_copy(_line, _end, string_length(_line) - _end + 1);
}

///@desc 按时间为新音符分配蓝红颜色，避开仍在持续的实体 Arc
function aff_assign_colors(_sources, _converted) {
	var _spans = [];
	var _notes = [];
	var _parts = [];
	var _output = [];
	for (var _i = 0; _i < array_length(_sources); _i++) {
		_output[_i] = _converted[_i];
		// 原有蓝红实体 Arc 的颜色不变，音轨、绿色和灰色不占用蓝红颜色
		var _fields = aff_solid_arc_fields(_sources[_i]);
		if (array_length(_fields) > 0) {
			var _start = real(_fields[0]);
			var _finish = real(_fields[1]);
			var _color = real(_fields[7]);
			if (_finish > _start && (_color == 0 || _color == 1)) {
				_spans[array_length(_spans)] = [_start, _finish, _color];
			}
		}
		if (_sources[_i] == _converted[_i]) {
			continue;
		}
		var _source = aff_trim(_sources[_i]);
		var _offset = (string_copy(_source, 1, 4) == "arc(") ? 1 : 0;
		var _step = (string_copy(_source, 1, 5) == "hold(") ? 1 : 3;
		var _lines = aff_generated_lines(_converted[_i]);
		_parts[_i] = _lines;
		for (var _j = _offset; _j < array_length(_lines); _j += _step) {
			_fields = aff_solid_arc_fields(_lines[_j]);
			if (array_length(_fields) > 0) {
				// 每个 tap 仅登记中心 Arc，左右水平 Arc 随中心 Arc 一起配色
				_notes[array_length(_notes)] = [real(_fields[0]), real(_fields[1]), real(_fields[2]), _i, _j, _step];
			}
		}
	}
	array_sort(_spans, function(_a, _b) {
		return sign(_a[0] - _b[0]);
	});
	array_sort(_notes, function(_a, _b) {
		if (_a[0] != _b[0]) return sign(_a[0] - _b[0]);
		// 同时开始的音符按横坐标、原行号及列表位置确定顺序
		if (_a[2] != _b[2]) return sign(_a[2] - _b[2]);
		if (_a[3] != _b[3]) return sign(_a[3] - _b[3]);
		return sign(_a[4] - _b[4]);
	});
	var _span_index = 0;
	var _has_color = [false, false];
	var _ends = [0, 0];
	for (var _i = 0; _i < array_length(_notes); _i++) {
		var _note = _notes[_i];
		var _time = _note[0];
		while (_span_index < array_length(_spans)) {
			var _span = _spans[_span_index];
			if (_span[0] > _time) break;
			var _color = _span[2];
			_ends[_color] = _has_color[_color] ? max(_ends[_color], _span[1]) : _span[1];
			_has_color[_color] = true;
			_span_index++;
		}
		var _blue = _has_color[0] && _ends[0] > _time;
		var _red = _has_color[1] && _ends[1] > _time;
		var _color = (_note[2] <= 0.5) ? 0 : 1;
		if (_blue && !_red) {
			_color = 1;
		} else if (_red && !_blue) {
			_color = 0;
		}
		var _lines = _parts[_note[3]];
		for (var _j = 0; _j < _note[5]; _j++) {
			_lines[_note[4] + _j] = aff_set_arc_color(_lines[_note[4] + _j], _color);
		}
		_parts[_note[3]] = _lines;
		// 起始时刻占用颜色，结束时刻释放；水平 Arc 不单独占用颜色
		if (_note[1] > _time) {
			_ends[_color] = _has_color[_color] ? max(_ends[_color], _note[1]) : _note[1];
			_has_color[_color] = true;
		}
	}
	for (var _i = 0; _i < array_length(_sources); _i++) {
		if (_sources[_i] != _converted[_i]) {
			var _lines = _parts[_i];
			_output[_i] = _lines[0];
			for (var _j = 1; _j < array_length(_lines); _j++) {
				_output[_i] += "\r\n" + _lines[_j];
			}
		}
	}
	return _output;
}
