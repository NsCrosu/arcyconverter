///@desc 文件保存
var newFileOpen = get_save_filename("AFF File|*.aff", "3.aff");
if (newFileOpen != ""){
	var f = file_text_open_write(newFileOpen);
	for(var i = 0; aff[i] != ""; i++){
		file_text_write_string(f, aff[i]);
	}
	file_text_close(f);
}else{
	game_end();
}
game_end();
