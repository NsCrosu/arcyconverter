///@desc 读取aff
draw_enable_drawevent(false);
aff = array_create(100000, "");
var line = 0;
var open = get_open_filename("AFF File|*.aff", "2.aff");
if (open != ""){
	var f = file_text_open_read(open);
	while(!file_text_eof(f)){
		aff[line++] = file_text_readln(f);
	}
}else{
	game_end();
}
duration = 25; // 中心arc的长度
alarm[0] = 1;
