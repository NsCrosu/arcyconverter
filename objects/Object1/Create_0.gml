///@desc 读取aff
draw_enable_drawevent(false);
aff = [];
aff_line_count = 0;
var open = get_open_filename("AFF File|*.aff", "2.aff");
if (open != ""){
	var f = file_text_open_read(open);
	while(!file_text_eof(f)){
		aff[aff_line_count++] = file_text_read_string(f);
		file_text_readln(f);
	}
	file_text_close(f);
}else{
	game_end();
	exit;
}
// 保存转换前的谱面，用于区分已有实体 Arc 和新生成的 Arc
aff_color_sources = [];
for (var i = 0; i < aff_line_count; i++) {
	aff_color_sources[i] = aff[i];
}
duration = 25; // 中心arc的长度
alarm[0] = 1;
