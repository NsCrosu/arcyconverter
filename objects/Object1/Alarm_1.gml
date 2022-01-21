///@desc 地面tap转换
for(var i = 0; aff[i] != ""; i++){
	while(string_char_at(aff[i], 1) == "("){
		var time = string_copy(aff[i], 2, string_pos(",", aff[i]) - 2);
		var lane = real(string_copy(aff[i], string_pos(",", aff[i]) + 1, 1));
		var arcx = string(lane/2 - 0.75);
		var color = (lane <= 2) ? "0" : "1";
		var arc = "arc("
					+ time + ","
					+ string(real(time) + duration) + ","
					+ arcx + ","
					+ arcx + ","
					+ "s" + ","
					+ "0.00,0.00" + ","
					+ color + ","
					+ "none,false);";
		var arcL = "arc("
					+ time + ","
					+ time + ","
					+ arcx + ","
					+ string(real(arcx) - 0.15) + ","
					+ "s" + ","
					+ "0.00,0.00" + ","
					+ color + ","
					+ "none,false);";
		var arcR = "arc("
					+ time + ","
					+ time + ","
					+ arcx + ","
					+ string(real(arcx) + 0.15) + ","
					+ "s" + ","
					+ "0.00,0.00" + ","
					+ color + ","
					+ "none,false);";
		aff[i] = string_replace(aff[i], aff[i], arc + "\r\n" + arcL + "\r\n" + arcR + "\r\n");
	}
}
alarm[2] = 1;
