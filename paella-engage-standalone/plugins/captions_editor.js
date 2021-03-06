paella.plugins.captions = {classes:{}, instances:{}, events:{}, captions:null, enableEdit:false};

paella.plugins.captions.events = {
	loaded:'captions:loaded',
	enable:'captions:enable',
	disable:'captions:disable'	
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Captions Loader
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
paella.plugins.captions.classes.DFXPParser = Class.create({
	
	parseCaptions:function(text)
	{
		var xml = $(text);
		var ps = xml.find("body div p");
		var captions= [];
		var i = 0;		
		for (i=0; i< ps.length; i++) {		
			var c = this.getCaptionInfo(ps[i]);
			captions.push(c);
		}		
		return captions;
	},
	
	getCaptionInfo:function(cap) {
		var b = this.parseTimeTextToSeg(cap.getAttribute("begin"));
		var d = this.parseTimeTextToSeg(cap.getAttribute("end"));
		var v = $(cap).text();
		
		return {begin:b, duration:d, value:v};
	},
	
	parseTimeTextToSeg:function(ttime){
		var split = ttime.split(":");
		var h = parseInt(split[0]);
		var m = parseInt(split[1]);
		var s = parseInt(split[2]);
		return s+(m*60)+(h*60*60);
	},
	
	captionsToDxfp:function(captions){
		var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
		xml = xml + '<tt xml:lang="en" xmlns="http://www.w3.org/2006/10/ttaf1" xmlns:tts="http://www.w3.org/2006/04/ttaf1#styling">\n';
		xml = xml + '<body><div xml:id="captions" xml:lang="en">\n';
		
		for (var i=0; i<captions.length; i=i+1){
			var c = captions[i];
			xml = xml + '<p begin="'+ paella.utils.timeParse.secondsToTime(c.begin) +'" end="'+ paella.utils.timeParse.secondsToTime(c.duration) +'">' + c.value + '</p>\n';
		}
		xml = xml + '</div></body></tt>';
		
		return xml;
	}
});


paella.plugins.captions.classes.CaptionsLoader = Class.create({
	
	initialize:function() {
		var thisClass = this;
		$(document).bind(paella.events.loadComplete,function(event,params) {
			if ((paella.player.config.captions) && (paella.player.config.captions.enableEdit)){
				paella.plugins.captions.enableEdit = true;				
			}
			thisClass.loadCaptions();
		});		
	},
	
	loadCaptionsUsingMediapackage:function(onSuccess, onError){
		var catalogs = null;
		try {
			catalogs = paella.matterhorn.episode.mediapackage.metadata.catalog;
			if (!(catalogs instanceof Array)){
			    catalogs = [catalogs];
			}					
		}
		catch(e){catalogs = null;}
		if (catalogs != null){
			var catalog = null;
			for (var i=0; i< catalogs.length; i=i+1){
				var c = catalogs[i];
				if (c.type == "captions/timedtext"){
					catalog = c;
					break;
				}
			}
			if (catalog != null){
				paella.debug.log("Captions found in MediaPackage: Loading Captions file...");
				// Load captions!
				var proxyUrl = '';
				var useJsonp = paella.player.config.proxyLoader.usejsonp;
				if (paella.player.config.proxyLoader && paella.player.config.proxyLoader.enabled) {
					proxyUrl = paella.player.config.proxyLoader.url;
				}
				
				new paella.Ajax(catalog.url, {}, function(response) {
					if (response){					
						var parser = new paella.plugins.captions.classes.DFXPParser();
						paella.plugins.captions.captions = parser.parseCaptions(response);						
						$(document).trigger(paella.plugins.captions.events.loaded, {});	
						if (onSuccess) onSuccess();						
					}
					else{
						if (onError) onError();
					}
				}, proxyUrl, useJsonp, 'GET');
				
			}
			else{
				paella.debug.log("Captions does not found in MediaPackage!");		
			}
		}		
	},
	
	loadCaptionsUsingAnnotations:function(onSuccess, onError){
		var episodeid = paella.matterhorn.episode.id;
		this.loadAttachmentData(episodeid, "paella/captions/timedtext", function(value){
			if (value){
				paella.debug.log("Captions found in the annotation service: Loading annotation file...");
				var parser = new paella.plugins.captions.classes.DFXPParser();
				paella.plugins.captions.captions = parser.parseCaptions(value);
				$(document).trigger(paella.plugins.captions.events.loaded, {});	
				if (onSuccess) onSuccess();						
			}
			else{
				paella.debug.log("Captions does not found in the annotation service!");
				if (onError) onError();
			}
		}, onError);
	},
	
	
	loadCaptions:function(onSuccess, onError){
		// Try to load Captions from annotation service first if active....
		var thisClass = this;
		if (this.enableEdit){
			this.loadCaptionsUsingAnnotations(null, function(){ thisClass.loadCaptionsUsingMediapackage(); });
		}
		else{
			this.loadCaptionsUsingMediapackage();
		}
	},
	
	saveCaptions:function(onSuccess, onError){
		var episodeid = paella.matterhorn.episode.id;
		var value = parser.captionsToDxfp(paella.plugins.captions.captions);
		paella.debug.log("Saving captions in the annotation service: Loading Annotation file...");

		this.saveAttachmentData(episodeid, "paella/captions/timedtext", value, onSuccess, onError);
	},
	
	loadAttachmentData:function(episodeid, type, onSuccess, onError){
		var loader = new paella.matterhorn.LoaderSaverInfo(paella.player.config);
		loader.loadData(episodeid, type, onSuccess, onError);
	},
	
	saveAttachmentData:function(episodeid, type, value, onSuccess, onError){
		var saver = new paella.matterhorn.LoaderSaverInfo(paella.player.config);
		saver.saveData(episodeid, type, value, onSuccess, onError);
	}
	
});

paella.plugins.captions.instances.captionsLoader = new paella.plugins.captions.classes.CaptionsLoader();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Captions Player Button Plugin
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
paella.plugins.captions.classes.CaptionsPlayerButtonPlugin = Class.create(paella.PlaybackPopUpPlugin,{
	button:null,
	thereAreCaptions:false,
	
	initialize:function() {
		this.parent();
		var thisClass = this;
		this.button = new Button('loadding_captionsplayer_button','captionsButton_noCaptions',function(event) { thisClass.onButtonClick(); }, true);
		
		$(document).bind(paella.plugins.captions.events.loaded,function(event,params) {
			thisClass.thereAreCaptions = true;
			thisClass.button.domElement.className = "captionsButton";			
		});
	},
	
	getRootNode:function(id) {
		this.button.identifier = id + '_captionsplayer_button';
		this.button.domElement.id = this.button.identifier;
		return this.button;
	},

	getWidth:function() {
		return 45;
	},
	
	setRightPosition:function(position) {
		this.button.domElement.style.right = position + 'px';
	},

	getPopUpContent:function(id) {
		return null;
	},
	
	checkEnabled:function(onSuccess) {
		onSuccess(true);
	},
	
	getIndex:function() {
		return 1005;
	},
	
	getName:function() {
		return "CaptionsPlayerButtonPlugin";
	},
	
	getMinWindowSize:function() {
		return 700;
	},
	
	onButtonClick:function() {
		if (this.thereAreCaptions == true) {
			if (this.button.isToggled()) {
				$(document).trigger(paella.plugins.captions.events.enable, {});
			}
			else {
				$(document).trigger(paella.plugins.captions.events.disable, {});
			}
		}
	}	
});

paella.plugins.captions.instances.captionsPlayerButtonPlugin = new paella.plugins.captions.classes.CaptionsPlayerButtonPlugin();



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Captions Player Overlay Plugin
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
paella.plugins.captions.classes.CaptionsPlayerOverlayPlugin = Class.create(paella.EventDrivenPlugin,{
	timer:null,	
	visible:false,	
	overlayFrame:null,

	getEvents:function() {
		
		return [paella.events.loadComplete,
			paella.events.play,
			paella.events.pause,
			paella.plugins.captions.events.enable,
			paella.plugins.captions.events.disable
		];
		
		return [];
	},
	
	onEvent:function(eventType,params) {
		switch (eventType) {
			case paella.events.loadComplete:
				this.loadComplete();
				break;
			case paella.events.play:
				this.startTimer();
				break;
			case paella.events.pause:
				this.pauseTimer();
				break;
			case paella.plugins.captions.events.enable:
				this.onEnable();
				break;
			case paella.plugins.captions.events.disable:
				this.onDisable();
				break;
		}
	},
	
	loadComplete:function() {		
		var overlayContainer = paella.player.videoContainer.overlayContainer;
		this.overlayFrame = document.createElement("div");
		this.overlayFrame.setAttribute('class',"CaptionsPlayerOverlayPlugin");
		overlayContainer.addElement(this.overlayFrame, overlayContainer.getMasterRect());
	},
	
	startTimer:function() {
		var thisClass = this;
		this.timer = new paella.utils.Timer(function(timer) {
			thisClass.onUpdateCaptions();
			},1000.0);
		this.timer.repeat = true;		
	},
	
	pauseTimer:function() {
		if (this.timer!=null) {
			this.timer.cancel();
			this.timer = null;
		}		
	},
	
	onUpdateCaptions:function() {		
		var captions = paella.plugins.captions.captions;
		
		if (captions){
			var time = paella.player.videoContainer.currentTime();
			cap = "";
			var i;
			for (i=0; i<captions.length;i++){
				if ((captions[i].begin<=time) && ((captions[i].begin+captions[i].duration)>=time)){
					cap = captions[i].value					
				}
			}
			this.overlayFrame.innerHTML = cap;
		}
	},

	onEnable:function() {
		this.visible = true;
		$(this.overlayFrame).show();
	},
	
	onDisable:function() {
		this.visible = false;
		$(this.overlayFrame).hide();
	},

	
	checkEnabled:function(onSuccess) {
		onSuccess(true);
	},
	
	getIndex:function() {
		return 1000;
	},
	
	getName:function() {
		return "CaptionsPlayerOverlayPlugin";
	}
});

paella.plugins.captions.instances.captionsPlayerOverlayPlugin = new paella.plugins.captions.classes.CaptionsPlayerOverlayPlugin();



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Captions Editor Plugin
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
paella.plugins.captions.classes.CaptionsEditorPlugin = Class.create(paella.editor.TrackPlugin,{
	tracks:[],
	selectedTrackItem:null,

	initialize:function() {
		this.parent();
		var thisClass = this;
		if (paella.utils.language()=="es") {
			var esDict = {
				'Captions':'Subtítulos',
				'Show':'Mostrar',
				'Hide':'Ocultar',
				'Show captions':'Mostrar subtítulos',
				'Hide captions':'Ocultar subtítulos'
			};
			paella.dictionary.addDictionary(esDict);
		}
		
		$(document).bind(paella.plugins.captions.events.loaded,function(event,params) {
			for (var i =0; i<paella.plugins.captions.captions.length; i=i+1){
				var c = paella.plugins.captions.captions[i];
				var id = thisClass.getTrackUniqueId();
				thisClass.tracks.push({id:id,s:c.begin,e:c.duration,content:c.value, lock:true});
			}
		});
		
	},

	getTrackItems:function() {
		for (var i=0;i<this.tracks.length;++i) {
			this.tracks[i].name = this.tracks[i].content;
		}
		return this.tracks;
	},
	
	getTools:function() {
		var tools = [
			{name:'show',label:paella.dictionary.translate('Show'),hint:paella.dictionary.translate('Show captions')},
			{name:'hide',label:paella.dictionary.translate('Hide'),hint:paella.dictionary.translate('Hide captions')}
		];
		if (paella.plugins.captions.enableEdit == true){
			tools.push({name:'create',label:paella.dictionary.translate('Create'),hint:paella.dictionary.translate('Create a new caption in the current position')});
			tools.push({name:'delete',label:paella.dictionary.translate('Delete'),hint:paella.dictionary.translate('Delete selected caption')});
		}
		
		return tools;
	},
	
	getTrackItemIndex:function(item) {
		for(var i=0;i<this.tracks.length;++i) {
			if (item.id==this.tracks[i].id) {
				return i;
			}
		}
		return -1;
	},

	onToolSelected:function(toolName) {
		if (this.selectedTrackItem && toolName=='delete' && this.selectedTrackItem) {
			this.tracks.splice(this.getTrackItemIndex(this.selectedTrackItem),1);
			return true;
		}
		else if (toolName=='show') {
			$(document).trigger(paella.plugins.captions.events.enable, {});
		}
		else if (toolName=='hide') {
			$(document).trigger(paella.plugins.captions.events.disable, {});
		}
		else if (toolName=='create') {
			var start = paella.player.videoContainer.currentTime();
			var end = start + 5;
			var id = this.getTrackUniqueId();
			this.tracks.push({id:id,s:start,e:end,content:paella.dictionary.translate('Caption')});
			return true;
		}
	},
	
	getTrackUniqueId:function() {
		var newId = -1;
		if (this.tracks.length==0) return 1;
		for (var i=0;i<this.tracks.length;++i) {
			if (newId<=this.tracks[i].id) {
				newId = this.tracks[i].id + 1;
			}
		}
		return newId;
	},
	
	getName:function() {
		return "CaptionsEditorPlugin";
	},
	
	getTrackName:function() {
		return paella.dictionary.translate("Captions");
	},
	
	getColor:function() {
		return 'rgb(212, 212, 224)';
	},
	
	getTextColor:function() {
		return 'rgb(90,90,90)';
	},
	
	onTrackChanged:function(id,start,end) {
		var item = this.getTrackItem(id);
		if (item) {
			item.s = start;
			item.e = end;
			this.selectedTrackItem = item;
		}
	},
	
	onTrackContentChanged:function(id,content) {
		var item = this.getTrackItem(id);
		if (item) {
			item.content = content;
			item.name = content;
		}
	},
	
	allowEditContent:function() {
		return paella.plugins.captions.enableEdit;
	},
	
	getTrackItem:function(id) {
		for (var i=0;i<this.tracks.length;++i) {
			if (this.tracks[i].id==id) return this.tracks[i];
		}
	},
	
	contextHelpString:function() {
		if (paella.utils.language()=="es") {
			return "Utiliza esta herramienta para crear, borrar y editar subtítulos. Para crear un subtítulo, selecciona el instante de tiempo haciendo clic en el fondo de la línea de tiempo, y pulsa el botón 'Crear'. Utiliza esta pestaña para editar el texto de los subtítulos";
		}
		else {
			return "Use this tool to create, delete and edit video captions. To create a caption, select the time instant clicking the timeline's background and press 'create' button. Use this tab to edit the caption text.";
		}
	}
});

paella.plugins.captions.instances.captionsEditorPlugin = new paella.plugins.captions.classes.CaptionsEditorPlugin();
