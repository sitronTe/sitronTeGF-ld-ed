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

// The main framework code
var sitronTeGF = {
	afID : null,
	prevTime : -1,
	canvas : null,
	canvasInfo : {
		id : null,
		width : 0,
		height : 0
	},
	gameState : {
		paused : false,
		asleep : false
	},
	skipUpdateLevel : 0.1,
	updateCameraTransform : true,

	activeWorld : null,

	assets : [],

	loadImage : function(loc) {
		var p = sitronTeGF.assets.length;
		var img = new Image();
		img["data-index"] = p;
		sitronTeGF.assets[p] = {
			loaded : false,
			domObj : img
		};
		img.onload = function() {
			sitronTeGF.assets[this["data-index"]].loaded=true;
		};
		img.src = loc;
		return p;
	},
	loadSound : function(loc) {
		var p = sitronTeGF.assets.length;
		var aud = new Audio();
		aud["data-index"] = p;
		sitronTeGF.assets[p] = {
			loaded : false,
			domObj : aud
		};
		aud.addEventListener("canplaythrough", function() {
			sitronTeGF.assets[this["data-index"]].loaded=true;
		});
		aud.src = loc;
		return p;
	},

	eventLocalCoord : function(mEvent) {
		if (sitronTeGF.canvas === null) {return {x:0, y:0};}
		var lx = 0, ly = 0;
		var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft;
		var scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
		var clientLeft = document.documentElement.clientLeft || document.body.clientLeft || 0;
		var clientTop = document.documentElement.clientTop || document.body.clientTop || 0;
		if (!mEvent) var mEvent = window.event;
		if (mEvent.pageX || mEvent.pageY) {
			lx = mEvent.pageX;
			ly = mEvent.pageY;
		} else if (mEvent.clientX || mEvent.clientY) {
			lx = mEvent.clientX + scrollLeft;
			ly = mEvent.clientY + scrollTop;
		}
		var rect = sitronTeGF.canvas.getBoundingClientRect();
		lx = lx - Math.round(rect.left + scrollLeft - clientLeft);
		ly = ly - Math.round(rect.top + scrollTop - clientTop);
		return {x:lx,y:ly};
	},
	eventToWorld : function(mEvent) {
		if (sitronTeGF.activeWorld.cameras.length > 0) {
			var cam = sitronTeGF.activeWorld.cameras[0].camera;
			if (cam.rowMajTransformInv === null) {
				cam.updateTransformInv();
			}
			var coord = sitronTeGF.eventLocalCoord(mEvent);
			var ti = cam.rowMajTransformInv;
			return {
				x : coord.x * ti[0][0] + coord.y * ti[0][1] + ti[0][2],
				y : coord.x * ti[1][0] + coord.y * ti[1][1] + ti[1][2],
				source : mEvent
			};
		}
		return {
			x : 0,
			y : 0,
			source : mEvent
		};
	},
	eventToGUI : function(mEvent) {
		var coord = sitronTeGF.eventLocalCoord(mEvent);
		return {
			x : coord.x / sitronTeGF.canvasInfo.width,
			y : coord.y / sitronTeGF.canvasInfo.height,
			source : mEvent
		};
	},
	updateSize : function() {
		if (sitronTeGF.canvas != null) {
			var w = sitronTeGF.canvas.clientWidth;
			var h = sitronTeGF.canvas.clientHeight;
			if ((w != sitronTeGF.canvasInfo.width) ||
			  (h != sitronTeGF.canvasInfo.height)) {
				sitronTeGF.canvasInfo.width = w;
				sitronTeGF.canvasInfo.height = h;
				sitronTeGF.canvas.width = w;
				sitronTeGF.canvas.height = h;
				sitronTeGF.updateCameraTransform = true;
			}
		} else {
			sitronTeGF.canvasInfo.width = 0;
			sitronTeGF.canvasInfo.height = 0;
		}
	},
	firstAnimationFrame : function(time) {
		sitronTeGF.prevTime = time;
		if (!sitronTeGF.gameState.asleep && sitronTeGF.canvas != null) {
			sitronTeGF.doDraw();
		}
		sitronTeGF.afID = window.requestAnimationFrame(
			sitronTeGF.onAnimationFrame
		);
	},
	
	onAnimationFrame : function(time) {
		if (sitronTeGF.canvas == null || sitronTeGF.gameState.asleep) {
			return;
		}
		if (!sitronTeGF.gameState.paused) {
			// From ms to s
			var dt = (time - sitronTeGF.prevTime) / 1000;
			sitronTeGF.prevTime = time;
			// Update state
			if (sitronTeGF.skipUpdateLevel > dt) {
				sitronTeGF.activeWorld.update(dt);
			}
		}
		sitronTeGF.doDraw();
		sitronTeGF.afID = window.requestAnimationFrame(
			sitronTeGF.onAnimationFrame
		);
	},
	doDraw : function() {
		// Check canvas size and update
		sitronTeGF.updateSize();
		if (sitronTeGF.updateCameraTransform) {
			sitronTeGF.activeWorld.updateCamerasTransform();
			sitronTeGF.updateCameraTransform = false;
		}
		// Get info object. Used to get canonical screen space and  gui space
		var canvInf = sitronTeGF.canvasInfo;
		// Get context and push css-transform
		var ctx = sitronTeGF.canvas.getContext("2d");
		ctx.setTransform(canvInf.width, 0, 0, canvInf.height, 0, 0);
		ctx.save();
		sitronTeGF.activeWorld.drawBackground(ctx);
		ctx.restore();
		ctx.save();
		sitronTeGF.activeWorld.draw(ctx);
		ctx.restore();
		sitronTeGF.activeWorld.drawGUI(ctx);
	},
	onClick : function(mEvent) {
		var guiCoord = sitronTeGF.eventToGUI(mEvent);
		if (!sitronTeGF.activeWorld.onGUIClick(guiCoord)) {
			var worldCoord = sitronTeGF.eventToWorld(mEvent);
			sitronTeGF.activeWorld.onClick(worldCoord);
		}
	},
	onPress : function(mEvent) {
		// TODO Make this pass down to world aswell
		var guiCoord = sitronTeGF.eventToGUI(mEvent);
		sitronTeGF.activeWorld.onGUIPress(guiCoord);
	},
	onRelease : function(mEvent) {
		// TODO Make this pass down to world aswell
		var guiCoord = sitronTeGF.eventToGUI(mEvent);
		sitronTeGF.activeWorld.onGUIRelease(guiCoord);
	},

	// Lifecycle methods
	// init is the function that starts it all
	init : function() {
		sitronTeGF.activeWorld = new sitronTeGWorld();
		var center = document.getElementById("sitronTeGF-body-center");
		while (center.firstChild) {
			center.removeChild(center.firstChild);
		}
		var canv = document.createElement("canvas");
		canv.id = "sitronTeGF-canvas";
		center.appendChild(canv);
		var actualStart = function() {
			if (typeof setup === "function") {
				sitronTeGLoading.initLoad();
				setup();
				sitronTeGLoading.startLoad();
				sitronTeGF.start("sitronTeGF-canvas");
			} else {
				window.setTimeout(actualStart, 50);
			}
		};
		actualStart();
	},
	// Start and stop should be called to start/stop app
	start : function(id) {
		if (sitronTeGF.afID === null) {
			sitronTeGF.canvas = document.getElementById(id);
			if (sitronTeGF.canvas !== null) {
				sitronTeGF.canvasInfo.id = id;
				sitronTeGF.canvas.addEventListener(
					"click",
					sitronTeGF.onClick
				);
				sitronTeGF.canvas.addEventListener(
					"mousedown",
					sitronTeGF.onPress
				);
				sitronTeGF.canvas.addEventListener(
					"mouseup",
					sitronTeGF.onRelease
				);
				sitronTeGF.resume();
				sitronTeGF.afID = window.requestAnimationFrame(
					sitronTeGF.firstAnimationFrame
				);
			}
		}
	},
	stop : function() {
		if (sitronTeGF.afID !== null) {
			window.cancelAnimationFrame(sitronTeGF.afID);
			sitronTeGF.afID = null;
			sitronTeGF.canvasInfo.id = null;
			if (sitronTeGF.canvas !== null) {
				sitronTeGF.canvas.removeEventListener(
					"click",
					sitronTeGF.onClick
				);
				sitronTeGF.canvas.removeEventListener(
					"mousedown",
					sitronTeGF.onPress
				);
				sitronTeGF.canvas.removeEventListener(
					"mouseup",
					sitronTeGF.onRelease
				);
				sitronTeGF.canvas = null;
			}
		}
	},
	// Pause stops update functions. Sleep stops drawing calls aswell. Resume resumes update and draw functions
	pause : function() {
		sitronTeGF.gameState.paused = true;
	},
	sleep : function() {
		sitronTeGF.gameState.asleep = true;
	},
	resume : function() {
		sitronTeGF.gameState.paused = false;
		sitronTeGF.gameState.asleep = false;
	}
};

// SFX and music
var sitronTeGSounds = {
	music : [],
	sfx : [],
	muted : false,
	randomizeMusic : true,
	keepPlayingMusic : true,
	activeSong : -1,
	musicVolume : 0.8,
	sfxVolume : 1,
	loadMusic : function(loc) {
		var p = sitronTeGSounds.music.length;
		var ap = sitronTeGF.loadSound(loc);
		sitronTeGSounds.music[p] = ap;
		sitronTeGF.assets[ap].domObj.onended=function() {
			this.currentTime=0;
			if (sitronTeGSounds.activeSong < 0) {
				return;
			}
			sitronTeGF.assets[sitronTeGSounds.music[sitronTeGSounds.activeSong]].domObj.currentTime=0;
			if (sitronTeGSounds.keepPlayingMusic) {
				sitronTeGSounds.playMusic();
			} else {
				sitronTeGSounds.activeSong = -1;
			}
		};
		return p;
	},
	loadSFX : function(loc) {
		var p = sitronTeGSounds.sfx.length;
		var ap = sitronTeGF.loadSound(loc);
		sitronTeGSounds.sfx[p]=ap;
		sitronTeGF.assets[ap].domObj.onended=function(){
			this.currentTime=0;
		};
		return p;
	},
	playMusic : function() {
		if (sitronTeGSounds.muted) {return;}
		var cur = sitronTeGSounds.activeSong;
		sitronTeGSounds.stopMusic();
		if (sitronTeGSounds.randomizeMusic) {
			cur=Math.floor(Math.random()*sitronTeGSounds.music.length);
		}
		if (cur < 0) {return;}
		sitronTeGSounds.activeSong=cur;
		var aud = sitronTeGF.assets[sitronTeGSounds.music[cur]].domObj;
		aud.currentTime=0;
		aud.volume=sitronTeGSounds.musicVolume;
		aud.play();
	},
	stopMusic : function() {
		if (sitronTeGSounds.activeSong < 0) {
			return;
		}
		var aud = sitronTeGF.assets[sitronTeGSounds.music[sitronTeGSounds.activeSong]].domObj;
		aud.pause();
		aud.currentTime=0;
		sitronTeGSounds.activeSong=-1;
	},
	playSFX : function(id) {
		if (sitronTeGSounds.muted) {return;}
		if (id < 0 || id >= sitronTeGSounds.sfx.length) {return;}
		var aud = sitronTeGF.assets[sitronTeGSounds.sfx[id]].domObj;
		aud.currentTime=0;
		aud.volume=sitronTeGSounds.sfxVolume;
		aud.play();
	}
};

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

// minimal game object constructor
function sitronTeGObj() {
	this.transform = {
		position : {
			x : 0,
			y : 0
		},
		rotation : 0,
		scale : {
			x : 1,
			y : 1
		}
	};
}
sitronTeGObj.prototype = {
	doDraw : function(context) {
		var trans = this.transform;
		context.translate(trans.position.x, trans.position.y);
		context.rotate(trans.rotation);
		context.scale(trans.scale.x, trans.scale.y);
		this.draw(context);
	},
	update : function(dt) {},
	draw : function(context) {},

	eventInside : function(positionInput) { return false; },

	// Quite easy to extend if necessary
	onClick : function(positionInput) { return false; }
};

// Used to create camera.
var sitronTeCamBuilder = {
	// A camera should inherit from gameobject, but have an additional module
	// Camera module. Stripped from functions, but a build function is
	// responsible for binding them
	camera : function() {
		// css : canonical screen space
		this.css = {
			centerX : 0,
			centerY : 0,
			width : 2,
			height : 2,
		};
		this.minViewport = {
			// Width & height -> scale implicit. Is this good?
			width : 2,
			height : 2,
			keepAspect : true,
			center : true
		};
		this.rowMajTransform = [
			[1, 0, 0],
			[0, 1, 0],
		];
		this.rowMajTransformInv = null;
	},

	// Functions that will be bound to the camera
	toWorldCoord: function(positionInput) {
		var ox = positionInput.x, oy = positionInput.y;

		var cam = this.camera;
		if (cam.rowMajTransformInv === null) {
			cam.updateTransformInv();
		}
		var ti = cam.rowMajTransformInv;

		return {x: ox*ti[0][0] + oy*ti[0][1] + ti[0][2], y: ox*ti[1][0] + oy*ti[1][1] + ti[1][2]};
	},
	updTrans : function() {
		var cam = this.camera;
		var canvInf = sitronTeGF.canvasInfo;
		var scW = canvInf.width * cam.css.width / 4;
		var scH = canvInf.height * cam.css.height / 4;
		var scx = canvInf.width / cam.minViewport.width;
		var scy = canvInf.height / cam.minViewport.height;
		// scxx and scyy is used to center camera when keeping aspect ratio
		// TODO this has been bug fix
		var scxx = scW, scyy = scH;
		if (cam.minViewport.keepAspect) {
			if (scx < scy) {
				scy = scx;
			} else {
				scx = scy;
			}
			if (!cam.minViewport.center) {
				// TODO THIS IS WRONG, but not used yet...
				scxx = scx;
				scyy = scy;
			}
		}

		cam.rowMajTransform[0]=[scx, 0, scxx - this.transform.position.x*scx];
		cam.rowMajTransform[1]=[0, -scy, this.transform.position.y * scy + scyy];
		cam.rowMajTransformInv = null;
	},
	updTransInv : function() {
		var trans = this.camera.rowMajTransform;
		var det = trans[0][0] * trans[1][1] - trans[0][1] * trans[1][0];
		var a31 = trans[0][1] * trans[1][2] - trans[0][2] * trans[1][1];
		var a32 = trans[0][0] * trans[1][2] - trans[0][2] * trans[1][0];
		this.camera.rowMajTransformInv = [
			[ trans[1][1] / det, -trans[0][1] / det,  a31 / det],
			[-trans[1][0] / det,  trans[0][0] / det, -a32 / det]
		];
	},

	// Create a camera function
	buildCamera : function() {
		var cam = new sitronTeGObj();
		cam.camera = new sitronTeCamBuilder.camera();
		cam.camera.updateTransform = sitronTeCamBuilder.updTrans.bind(cam);
		cam.camera.updateTransformInv = sitronTeCamBuilder.updTransInv.bind(cam);
		cam.camera.toWorldCoordinates = sitronTeCamBuilder.toWorldCoord.bind(cam);
		cam.camera.updateTransform();
		return cam;
	}
};

function sitronTeGWorld() {
	this.gameObjects = [];
	this.defaultBackground = "#000000";
	this.cameras = [sitronTeCamBuilder.buildCamera()];
};
sitronTeGWorld.prototype = {
	update : function(dt) {
		this.updateWorld(dt);
		for (var i = 0; i < this.gameObjects.length; i++) {
			if (this.gameObjects[i] !== null) { this.gameObjects[i].update(dt); }
		}
		for (var i = 0; i < this.cameras.length; i++) {
			this.cameras[i].update(dt);
		}
	},
	updateCamerasTransform : function(canvasAspect) {
		for (var i = 0; i < this.cameras.length; i++) {
			this.cameras[i].camera.updateTransform();
		}
	},
	updateWorld : function(dt) {
		// Override to have a global update function
	},
	draw : function(context) {
		for (var c=0; c < this.cameras.length; c++) {
			var cam = this.cameras[c].camera;
			var trans = cam.rowMajTransform;
			for (var i = 0; i < this.gameObjects.length; i++) {
				if (this.gameObjects[i] !== null) {
					context.setTransform(
						trans[0][0], trans[1][0], trans[0][1],
						trans[1][1], trans[0][2], trans[1][2]
					);
					this.gameObjects[i].doDraw(context);
				}
			}
			for (var i = 0; i < this.cameras.length; i++) {
				context.setTransform(
					trans[0][0], trans[1][0], trans[0][1],
					trans[1][1], trans[0][2], trans[1][2]
				);
				this.cameras[i].draw(context);
			}
		}
	},
	drawBackground : function(context) {
		context.fillStyle=this.defaultBackground;
		context.fillRect(0,0,1,1);
	},
	drawGUI : function(context) {
		// Override to have foreground/ GUI layer
	},
	onClick : function(localMouseEvent) {
		for (var i = 0; i < this.gameObjects.length; i++) {
			if (this.gameObjects[i] !== null) {
				if (this.gameObjects[i].eventInside(localMouseEvent)) {
					this.gameObjects[i].onClick();
				}
			}
		}
	},
	onGUIClick : function(localMouseEvent) {
		return false;
	},
	onGUIPress : function(localMouseEvent) {
		return false;
	},
	onGUIRelease : function(localMouseEvent) {
		return false;
	}
};

var sitronTeGLoading = {
	loadWorld : null,
	minTimeLeft : 3,
	info : {
		reportedDone : false,
		loaded : 0
	},
	initLoad : function() {
		var lw = new sitronTeGWorld();
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
		lw.updateWorld = sitronTeGLoading.update;
		lw.drawGUI = sitronTeGLoading.drawFG;
		sitronTeGLoading.loadWorld = lw;
	},
	startLoad : function() {
		var tmp = sitronTeGF.activeWorld;
		sitronTeGF.activeWorld = sitronTeGLoading.loadWorld;
		sitronTeGLoading.loadWorld = tmp;
	},
	update : function(dt) {
		if (sitronTeGLoading.info.reportedDone) { return; }
		if (sitronTeGLoading.minTimeLeft > 0) {
			sitronTeGLoading.minTimeLeft -= dt;
		}
		var count = 0;
		for (var i=0; i < sitronTeGF.assets.length; i++) {
			if (sitronTeGF.assets[i].loaded) { count++; }
		}
		var l = sitronTeGF.assets.length;
		var loadPart = l !== 0 ? count/sitronTeGF.assets.length : 1;
		sitronTeGLoading.info.loaded = loadPart;
		if (sitronTeGF.assets.length === count && sitronTeGLoading.minTimeLeft <= 0) {
			sitronTeGLoading.info.reportedDone = true;
			sitronTeGLoading.completed();
		}
		var r = Math.floor((1-loadPart)*223);
		var g = Math.floor(loadPart*191);
		this.defaultBackground = "rgb("+r+","+g+",63)";
	},
	completed : function() {
		var foot = document.getElementById("sitronTeGF-footer");
		while(foot.firstChild) {
			foot.removeChild(foot.firstChild);
		}
		var btn = document.createElement("button");
		btn.appendChild(document.createTextNode("Start with sound"));
		btn.addEventListener("click", sitronTeGLoading.startSound);
		foot.appendChild(btn);
		var btn = document.createElement("button");
		btn.appendChild(document.createTextNode("Start muted"));
		btn.addEventListener("click", sitronTeGLoading.startMuted);
		foot.appendChild(btn);
	},
	startSound : function() {
		sitronTeGSounds.muted = false;
		sitronTeGLoading.doStart();
	},
	startMuted : function() {
		sitronTeGSounds.muted = true;
		sitronTeGLoading.doStart();
	},
	doStart : function() {
		sitronTeGF.activeWorld = sitronTeGLoading.loadWorld;
		var foot = document.getElementById("sitronTeGF-footer");
		while(foot.firstChild) {
			foot.removeChild(foot.firstChild);
		}
		start();
	},
	drawFG : function(ctx) {
		ctx.fillStyle = "#666666";
		ctx.fillRect(sitronTeGLoading.info.loaded-0.05, 0.1, 0.1000, 0.8);
	}
};
