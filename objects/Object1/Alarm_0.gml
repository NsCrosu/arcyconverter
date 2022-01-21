///@desc hold转换
for(var i = 0; aff[i] != ""; i++){
	while(string_char_at(aff[i], 1) == "h"){
		var timeStart = string_copy(aff[i], 6, string_pos(",", aff[i]) - 6);
		var timeEnd = string_copy(aff[i], string_pos(",", aff[i]) + 1, string_pos_ext(",", aff[i], string_pos(",", aff[i]) + 1) + 1 - string_pos(",", aff[i]) - 2);
		var lane = real(string_copy(aff[i], string_pos_ext(",", aff[i], string_pos(",", aff[i]) + 1) + 1, 1));
		var arcx = string(lane/2 - 0.75);
		var color = (lane <= 2) ? "0" : "1";
		var arc = "arc("
					+ timeStart + ","
					+ timeEnd + ","
					+ arcx + ","
					+ arcx + ","
					+ "s" + ","
					+ "0.00,0.00" + ","
					+ color + ","
					+ "none,false);\r\n";
		aff[i] = string_replace(aff[i], aff[i], arc);
	}
}
alarm[1] = 1;
