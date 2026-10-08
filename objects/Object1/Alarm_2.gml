///@desc 天空 ArcTap 转换
for (var i = 0; i < aff_line_count; i++) {
	aff[i] = aff_convert_arctaps(aff[i], duration);
}
aff = aff_assign_colors(aff_color_sources, aff);
alarm[3] = 1;
