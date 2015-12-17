/*

Copyright 2015 Inge Halsaunet

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/

/*
// This can be seen as example code of sprite use
// It is fetched from previous load screen
		var spr = sitronTeSpriteBuilder.buildEmptySprite();
		spr.sprite.images[0] = document.getElementById("sitronTeGF-logo");
		spr.sprite.spriteInfos[0] = {
			src : { x:0, y:0, w:300, h:50 },
			dest : { x:-0.3, y:-0.05, w:0.6, h:0.1 }
		};
		spr.update = function(dt) {
			this.transform.rotation += dt;
		};
		spr.sprite.currentImage = 0;
		lw.gameObjects[0] = spr;
*/

var sitronTeSpriteBuilder = {
	sprite : function () {
		this.currentImage = -1;
		this.images = [];
		this.spriteInfos = [];
	},
	draw : function(ctx) {
		if (this.sprite.currentImage >= 0) {
			var img = this.sprite.images[this.sprite.currentImage];
			var info = this.sprite.spriteInfos[this.sprite.currentImage];
			ctx.drawImage(img, info.src.x, info.src.y, info.src.w, info.src.h, info.dest.x, info.dest.y, info.dest.w, info.dest.h);
		}
	},
	buildEmptySprite : function() {
		var spr = new sitronTeGObj();
		spr.transform.scale.y = -1;
		spr.sprite = new sitronTeSpriteBuilder.sprite();
		spr.draw = sitronTeSpriteBuilder.draw;
		return spr;
	},
	buildSimpleSprite : function(loc, offsetX, offsetY, width, height) {
		var spr = sitronTeSpriteBuilder.buildEmptySprite();
		var index = sitronTeGF.loadImage(loc);
		spr.sprite.images[0] = sitronTeGF.assets[index].domObj;
		spr.sprite.spriteInfos[0] = {
			src : { x:0, y:0, w:width, h:height },
			dest : { x:offsetX, y:offsetY, w:width, h:height }
		};
		spr.sprite.currentImage = 0;
		return spr;
	},
	buildRegularSingleImgSprite : function(loc, offsetX, offsetY, width, height, count) {
		var spr = sitronTeSpriteBuilder.buildEmptySprite();
		var index = sitronTeGF.loadImage(loc);
		var img = sitronTeGF.assets[index].domObj;
		for (var i=0; i < count; i++) {
			spr.sprite.images[i] = img;
			spr.sprite.spriteInfos[i] = {
				src : { x:i*width, y:0, w:width, h:height },
				dest : { x:offsetX, y:offsetY, w:width, h:height }
			};
		}
		spr.sprite.currentImage = 0;
		return spr;
	}
};
