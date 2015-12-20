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

function sitronTeG2DContextTransform() {
	this.ctx = null;
	this.lvl = 0;
	/*
	Transforms stored in order, fitting of setTransform, [a,b,c,d,e,f] =>
	| a c e |
	| b d f |
	| 0 0 1 |
	*/
	this.trMat = [[ 1, 0, 0, 1, 0, 0 ]];
}
sitronTeG2DContextTransform.prototype = {
	pushTransform : function(trans) {
		var aMat = this.trMat[this.lvl];
		this.lvl++;
		/*
		Assume composite transform matrix is:
		| S_x*cos(phi) -S_y*sin(phi) d_x |
		| S_x*sin(phi)  S_y*cos(phi) d_y |
		|            0             0   1 |
		Multiplication:
		| a11 a21 a31 | | b11 b21 b31 | | a11*b11+a21*b12 a11*b21+a21*b22 a11*b31+a21*b32+a31 |
		| a12 a22 a32 |*| b12 b22 b32 |=| a12*b11+a22*b12 a12*b21+a22*b22 a12*b31+a22*b32+a32 |
		|   0   0   1 | |   0   0   1 | |               0               0                   1 |
		*/
		var cosPhi = Math.cos(trans.rotation);
		var sinPhi = Math.sin(trans.rotation);
		var scX = trans.scale.x;
		var scY = trans.scale.y;
		var b11 = scX * cosPhi;
		var b12 = scX * sinPhi;
		var b21 = -scY * sinPhi;
		var b22 = scY * cosPhi;
		var b31 = trans.position.x;
		var b32 = trans.position.y;
		this.trMat[this.lvl] = [
			aMat[0]*b11 + aMat[2]*b12, // c11
			aMat[1]*b11 + aMat[3]*b12, // c12
			aMat[0]*b21 + aMat[2]*b22, // c21
			aMat[1]*b21 + aMat[3]*b22, // c22
			aMat[0]*b31 + aMat[2]*b32 + aMat[4], // c31
			aMat[1]*b31 + aMat[3]*b32 + aMat[5]// c33
		];
	},
	popTransform : function() {
		if (this.lvl > 0) { this.lvl--; }
	},
	readyContext : function() {
		var m = this.trMat[this.lvl];
		this.ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
		return this.ctx;
	},
	reset : function(context, rMajTrans) {
		this.ctx = context;
		this.lvl = 0;
		this.trMat[0] = [ rMajTrans[0][0], rMajTrans[1][0], rMajTrans[0][1], rMajTrans[1][1], rMajTrans[0][2], rMajTrans[1][2] ];
	}
};

var sitronTeGHelper = {
	// TODO Test if we have scoping correct (propName + valName)
	addObservableProperty : function(obj, propName, defaultValue) {
		var valName = propName+"_value";
		obj[valName] = defaultValue;
		obj[propName+"_observers"] = [];
		obj.addObserver = sitronTeGHelper.addObserver;
		obj.alertObservers = sitronTeGHelper.alertObservers;
		Object.defineProperty(
			obj, propName,
			{
				get : function() {
					return this[valName];
				},
				set : function(val) {
					var old = this[valName];
					this[valName] = val;
					if (val !== old) { this.alertObservers(old, val, propName); }
				}
			}
		);
	},
	// Should NOT be called directely from this, but rather on the object which has the observable property
	addObserver : function (propName, obs) {
		var obss = this[propName+"_observers"];
		if (obss !== null) {
			obss[obss.length] = obs;
		}
	},
	// Should NOT be called directely
	alertObservers : function(oldVal, newVal, propName) {
		var obss = this[propName+"_observers"];
		if (obss !== null) {
			for (var i = 0; i < obss.length; i++) {
				obss[i](oldVal, newVal, propName);
			}
		}
	},
	createLabelElement : function(forId, label) {
		var lblEl = document.createElement("label");
		lblEl.setAttribute("for", forId);
		lblEl.appendChild(document.createTextNode(label));
		return lblEl;
	},
	createSlideElement : function(id, defaultValue, min, max) {
		var slideEl = document.createElement("input");
		slideEl.id = id;
		slideEl.type = "range";
		slideEl.min = min;
		slideEl.max = max;
		slideEl.value = defaultValue;
		return slideEl;
	}
}

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
		var cam = sitronTeGF.activeWorld.camera.camera;
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
		// Get info object. Used to get canonical screen space and  gui space
		var canvInf = sitronTeGF.canvasInfo;
		// Get context and push css-transform
		var ctx = sitronTeGF.canvas.getContext("2d");
		ctx.setTransform(canvInf.width, 0, 0, canvInf.height, 0, 0);
		sitronTeGF.activeWorld.drawBackground(ctx);
		sitronTeGF.activeWorld.draw(ctx);
		ctx.setTransform(canvInf.width, 0, 0, canvInf.height, 0, 0);
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
		var guiCoord = sitronTeGF.eventToGUI(mEvent);
		if (!sitronTeGF.activeWorld.onGUIPress(guiCoord)) {
			var worldCoord = sitronTeGF.eventToWorld(mEvent);
			sitronTeGF.activeWorld.onPress(worldCoord);
		}
	},
	onRelease : function(mEvent) {
		var guiCoord = sitronTeGF.eventToGUI(mEvent);
		if (!sitronTeGF.activeWorld.onGUIRelease(guiCoord)) {
			var worldCoord = sitronTeGF.eventToWorld(mEvent);
			sitronTeGF.activeWorld.onRelease(worldCoord);
		}
	},
	onKeyDown : function(kEvent) {
		if (sitronTeGF.activeWorld !== null) {
			sitronTeGF.activeWorld.onKeyDown(kEvent);
		}
	},
	onKeyUp : function(kEvent) {
		if (sitronTeGF.activeWorld !== null) {
			sitronTeGF.activeWorld.onKeyUp(kEvent);
		}
	},
	focusKeyListener : function() {
		document.getElementById("sitronTeGF-header").focus();
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
sitronTeGHelper.addObservableProperty(sitronTeGF, "acceptKeyEvents", false);
sitronTeGF.addObserver("acceptKeyEvents", function(ov, nv, pname) {
	var lEl = document.getElementById("sitronTeGF-header");
	var fEl = document.getElementById("sitronTeGF-content");
	if (nv) {
		lEl.addEventListener("keydown", sitronTeGF.onKeyDown);
		lEl.addEventListener("keyup", sitronTeGF.onKeyUp);
		fEl.addEventListener("click", sitronTeGF.focusKeyListener);
	} else {
		lEl.removeEventListener("keydown", sitronTeGF.onKeyDown);
		lEl.removeEventListener("keyup", sitronTeGF.onKeyUp);
		fEl.removeEventListener("click", sitronTeGF.focusKeyListener);
	}
});

// SFX and music
var sitronTeGSounds = {
	music : [],
	sfx : [],
	randomizeMusic : true,
	keepPlayingMusic : true,
	activeSong : -1,
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
	},
	musicVolChanged : function(ov, nv, pname) {
		for (var i = 0; i < sitronTeGSounds.music.length; i++) {
			sitronTeGF.assets[sitronTeGSounds.music[i]].domObj.volume=nv;
		}
	},
	sfxVolChanged : function(ov, nv, pname) {
		for (var i = 0; i < sitronTeGSounds.sfx.length; i++) {
			sitronTeGF.assets[sitronTeGSounds.sfx[i]].domObj.volume=nv;
		}
	},
	createVolumeControls : function() {
		var contEl = document.createElement("div");
		contEl.className = "sitronTeGF-volume-control";
		contEl.appendChild(sitronTeGHelper.createLabelElement("sitronTeGF-music-volume", "Music volume"));
		contEl.appendChild(document.createElement("br"));
		var mVolSlide = sitronTeGHelper.createSlideElement("sitronTeGF-music-volume", sitronTeGSounds.musicVolume*100, 0, 100);
		mVolSlide.addEventListener("change", function() {
			sitronTeGSounds.musicVolume = this.value/100;
		});
		sitronTeGSounds.addObserver("musicVolume", function(ov, nv, pname) {
			// TODO Ensure that this is in correct scope (closure thingy)
			mVolSlide.value = nv * 100;
		});
		contEl.appendChild(mVolSlide);
		contEl.appendChild(document.createElement("br"));

		contEl.appendChild(sitronTeGHelper.createLabelElement("sitronTeGF-sfx-volume", "SFX volume"));
		contEl.appendChild(document.createElement("br"));
		var sVolSlide = sitronTeGHelper.createSlideElement("sitronTeGF-sfx-volume", sitronTeGSounds.sfxVolume*100, 0, 100);
		sVolSlide.addEventListener("change", function() {
			sitronTeGSounds.sfxVolume = this.value/100;
		});
		sitronTeGSounds.addObserver("sfxVolume", function(ov, nv, pname) {
			// TODO Ensure that this is correct scope (closure thingy)
			sVolSlide.value = nv * 100;
		});
		contEl.appendChild(sVolSlide);
		contEl.appendChild(document.createElement("br"));

		contEl.appendChild(document.createElement("br"));
		contEl.appendChild(sitronTeGHelper.createLabelElement("sitronTeGF-volume-muted", "Mute"));
		var chkBxEl = document.createElement("input");
		chkBxEl.id = "sitronTeGF-volume-muted";
		chkBxEl.type = "checkbox";
		chkBxEl.checked = sitronTeGSounds.muted;
		chkBxEl.addEventListener("change", function() {
			sitronTeGSounds.muted = this.checked;
		});
		sitronTeGSounds.addObserver("muted", function(ov, nv, pname) {
			// TODO Ensure that this is correct scope (closure thingy)
			chkBxEl.checked = nv;
			if (nv) {
				// TODO Stop all sounds in a better way than this
				sitronTeGSounds.musicVolume = 0;
				sitronTeGSounds.sfxVolume = 0;
			}
		});
		contEl.appendChild(chkBxEl);

		return contEl;
	}
};
sitronTeGHelper.addObservableProperty(sitronTeGSounds, "muted", false);
sitronTeGHelper.addObservableProperty(sitronTeGSounds, "musicVolume", 0.8);
sitronTeGSounds.addObserver("musicVolume", sitronTeGSounds.musicVolChanged);
sitronTeGHelper.addObservableProperty(sitronTeGSounds, "sfxVolume", 1);
sitronTeGSounds.addObserver("sfxVolume", sitronTeGSounds.sfxVolChanged);

function sitronTeGTransform() {
	this.position = {
		x : 0,
		y : 0
	};
	this.rotation = 0;
	this.scale = {
		x : 1,
		y : 1
	};
}

// minimal game object constructor
function sitronTeGObj() {
	this.transform = new sitronTeGTransform();
}
sitronTeGObj.prototype = {
	doDraw : function(contextWrap) {
		contextWrap.pushTransform(this.transform);
		this.draw(contextWrap.readyContext());
		contextWrap.popTransform();
	},
	update : function(dt) {},
	draw : function(context) {},

	eventInside : function(positionInput) { return false; },

	// Quite easy to extend if necessary
	onClick : function(positionInput) { return false; },
	onPress : function(positionInput) { return false; },
	onRelease : function(positionInput) { return false; }
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

function sitronTeGLayer() {
	this.transform = new sitronTeGTransform();
	this.gameObjects = [];
}
sitronTeGLayer.prototype = {
	updateGObjs : function(dt) {
		for (var i = 0; i < this.gameObjects.length; i++) {
			if (this.gameObjects[i] !== null) { this.gameObjects[i].update(dt); }
		}
	},
	update : function(dt) {
		// Override to have an update function that runs AFTER camera is updated
	},
	doDraw : function(contextWrap) {
		contextWrap.pushTransform(this.transform);
		for (var i = 0; i < this.gameObjects.length; i++) {
			if (this.gameObjects[i] !== null) { this.gameObjects[i].doDraw(contextWrap); }
		}
		contextWrap.popTransform();
	}
};

function sitronTeGWorld() {
	this.layers = [];
	// TODO Decide if direct children of world should be prohibited
	this.gameObjects = [];
	this.defaultBackground = "#000000";
	this.camera = sitronTeCamBuilder.buildCamera();
	this.ctxWrapper = new sitronTeG2DContextTransform();
}
sitronTeGWorld.prototype = {
	update : function(dt) {
		this.updateWorld(dt);
		for (var i = 0; i < this.layers.length; i++) {
			if (this.layers[i] !== null) { this.layers[i].updateGObjs(dt); }
		}
		for (var i = 0; i < this.gameObjects.length; i++) {
			if (this.gameObjects[i] !== null) { this.gameObjects[i].update(dt); }
		}
		this.camera.update(dt);
		for (var i = 0; i < this.layers.length; i++) {
			if (this.layers[i] !== null) { this.layers[i].update(dt); }
		}
	},
	updateCameraTransform : function(canvasAspect) {
		this.camera.camera.updateTransform();
	},
	updateWorld : function(dt) {
		// Override to have a global update function
	},
	draw : function(context) {
		// This should ensure that most times the camera transform is correct (unless there is no canvas)
		this.updateCameraTransform();
		var cWr = this.ctxWrapper;
		cWr.reset(context, this.camera.camera.rowMajTransform);
		for (var i = 0; i < this.layers.length; i++) {
			if (this.layers[i] !== null) { this.layers.doDraw(cWr); }
		}
		for (var i = 0; i < this.gameObjects.length; i++) {
			if (this.gameObjects[i] !== null) { this.gameObjects[i].doDraw(cWr); }
		}
		this.camera.doDraw(cWr);
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
	onPress : function(localMouseEvent) {
		for (var i = 0; i < this.gameObjects.length; i++) {
			if (this.gameObjects[i] !== null) {
				if (this.gameObjects[i].eventInside(localMouseEvent)) {
					this.gameObjects[i].onPress();
				}
			}
		}
	},
	onRelease : function(localMouseEvent) {
		for (var i = 0; i < this.gameObjects.length; i++) {
			if (this.gameObjects[i] !== null) {
				if (this.gameObjects[i].eventInside(localMouseEvent)) {
					this.gameObjects[i].onRelease();
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
	},
	onKeyDown : function(kEvent) {},
	onKeyUp : function(kEvent) {}
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
