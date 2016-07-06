Number.prototype.toRad = function() {
   return this * Math.PI / 180;
}
Number.prototype.toDeg = function() {
   return this * 180 / Math.PI;
}

var Metros = function() {
  var nestedCities,
    geoJSONUrl,
    sceneURL,
    displayMap,
    extractLayers = [],
    xhr,
    keyIndex = -1,
    placeID = null;

  var rect, 
    dots = [],
    outline,
    requestBoundingBox;

  var MetrosApp = {
    init : function(nestedData, jsonURL, scene) {
      nestedCities = nestedData;
      geoJSONUrl = jsonURL;
      sceneURL = scene;
      this.initDisplayMap();
      return this;
    },
    hasWebGL : function() {
      try {
        var canvas = document.createElement('canvas')
        return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
      } catch (x) {
        return false
      }
    },
    initDisplayMap : function() {
      var southwest = L.latLng(0, -125),
        northeast = L.latLng(0, 125),
        options = {
          scrollWheelZoom: false,
          // Disables dragging on touch-detected devices
          dragging: (window.self !== window.top && L.Browser.touch) ? false : true,
          tap: (window.self !== window.top && L.Browser.touch) ? false : true,
        };
      displayMap = L.map('map', options).fitBounds(L.latLngBounds(southwest, northeast));

      if (this.hasWebGL() === true) {
        var layer = Tangram.leafletLayer({
          scene: sceneURL,
          attribution: '<a href="https://mapzen.com/tangram">Tangram</a> | &copy; OSM contributors | <a href="https://mapzen.com/">Mapzen</a>'
        });
      } else {
        var layer = L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}.png', {
          attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>.',
        });
      }
      layer.addTo(displayMap);

      var onEachFeature = function (feature, layer) {
        extractLayers.push(layer);
        layer.bindPopup("<a href='"+feature.properties.href+"'>"+feature.properties.display_name+"</a>");
      }

      d3.json(geoJSONUrl, function(data){
        L.geoJson(data, { onEachFeature: onEachFeature }).addTo(displayMap);
      });
    },
    filterList : function(str) {
      var newData = [];
      str = str.toLowerCase();
      nestedCities.forEach(function(d){
        if (d.country.toLowerCase().indexOf(str) != -1) {
          newData.push(d);
        } else {
          var c = {
            country : d.country,
            metros : []
          }
          d.metros.forEach(function(e){ 
            if (e.name.toLowerCase().indexOf(str) != -1)
              c.metros.push(e);
          });
          if (c.metros.length) newData.push(c);
        }
      });
      this.drawList(newData);
    },
    drawList : function(data, request_id, display_name) {
      var countries = d3.select("#extracts").selectAll(".country").data(data);
      var enterCountries = countries.enter().append("div").attr("class","country");
      countries.exit().remove();
      enterCountries.append("div").attr("class","country-name")
      var m = this;
      countries.select(".country-name")
        .text(function(d){ return d.country; })
        .on("click",function(d){
          m.doSearch(d.country);
        });
      var cities = countries.selectAll(".city").data(function(d){ return d.metros; });
      cities.enter().append("a").attr("class","city");
      cities.text(function(d){ return d.name; })
        .attr("href",function(d){ return d.href + (request_id ? escape(request_id)+"/"+escape(display_name) : ""); });
      cities.exit().remove();
    },
    doSuggestion : function(query) {
      if (xhr) xhr.abort();
      var m = this;
      xhr = d3.json("https://search.mapzen.com/v1/autocomplete?text="+query+"&sources=wof&api_key=search-owZDPeC", function(error, json) {
        if (json.features.length)
          m.showSuggestions(json);
      });
    },
    showSuggestions : function(data) {
      var suggestion = d3.select(".autocomplete")
        .selectAll(".suggestion").data(data.features);
      suggestion.enter().append("div").attr("class","suggestion");
      suggestion.exit().remove();
      var m = this;
      suggestion.text(function(d){ return d.properties.label; })
        .on("click",function(d){
          placeID = d.properties.source + ":" + d.properties.layer + ":" + d.properties.id;
          m.onSubmit(d.properties.label);
        });
    },
    selectSuggestion : function() {
      var currentList = d3.selectAll(".suggestion");
      currentList.each(function(d, i){ 
        if (i == keyIndex) {
          document.getElementById("search_input").value = d.properties.label;
          placeID = d.properties.source + ":" + d.properties.layer + ":" + d.properties.id;
        }
      }).classed("selected",function(d,i){ return i == keyIndex; });
    },
    onSubmit : function(val) {
      keyIndex = -1;
      this.filterList(val);
      d3.selectAll(".suggestion").remove();
      this.doSearch(val);
      placeID = null;
    },
    suggestPlace : function(metro) {
      var m = this;
      d3.select("#did-you-mean").style("display","block")
        .select(".name").text(metro.properties.label)
        .on("click",function(){
          d3.select(this.parentNode).style("display","none");
          var bbox = metro.bbox;
          displayMap.fitBounds([[bbox[1],bbox[0]],[bbox[3], bbox[2]]]).zoomOut(1);
          document.getElementById("search_input").value = metro.properties.label;
          m.filterList(metro.properties.label);
          m.requestExtract(metro);
        });
      d3.select("#make-request").style("display","none");
    },
    processKeyup : function(event) {
      var inputDiv = document.getElementById("search_input");
      var val = inputDiv.value;

      if (!val.length) {
        this.drawList(nestedCities);
        d3.selectAll(".suggestion").remove();
        placeID = null;
        this.clearRequest();
        return;
      }

      if (event.keyCode == 40) { //arrow down
        keyIndex = Math.min(keyIndex+1, d3.selectAll(".suggestion")[0].length-1);
        this.selectSuggestion();   
      } else if (event.keyCode == 38) { //arrow up
        keyIndex = Math.max(keyIndex-1, 0);
        this.selectSuggestion();
      } else if (event.keyCode == 13) { //enter
        this.onSubmit(val);
      } else if (event.keyCode != 8 && (event.keyCode < 48 || event.keyCode > 90)) {
        return; //restrict autocomplete to 0-9,a-z character input, excluding delete
      } else {
        keyIndex = -1;
        placeID = null;
        this.doSuggestion(val);
        this.filterList(val);
      }
    },
    doSearch : function(query) {
      d3.selectAll(".suggestion").remove();
      var m = this;

      if (placeID) {
        d3.json("https://search.mapzen.com/v1/place?api_key=search-owZDPeC&ids="+placeID, function(error, json){
          var bbox = json.features[0].bbox;
          displayMap.fitBounds([[bbox[1],bbox[0]],[bbox[3], bbox[2]]]).zoomOut(1);
          m.requestExtract(json.features[0]);
        });
      } else {
        d3.json("https://search.mapzen.com/v1/search?text="+query+"&sources=wof&api_key=search-owZDPeC", function(error, json) {
          if (json.features[0].properties.label.toLowerCase().indexOf(query.toLowerCase()) == -1
            && d3.selectAll(".city")[0].length == 0) {
            m.suggestPlace(json.features[0]);
          } else if (d3.selectAll(".city")[0].length == 0){
            var bbox = json.features[0].bbox;
            displayMap.fitBounds([[bbox[1],bbox[0]],[bbox[3], bbox[2]]]).zoomOut(1);
            document.getElementById("search_input").value = json.features[0].properties.label;
            m.requestExtract(json.features[0]);
          } else {
            m.clearRequest();
          }
        });
      }
    },
    requestExtract : function(metro) {
      var geoID = metro.properties.id;
      d3.select("input[name='wof_id']").attr("value",geoID);
      d3.select("input[name='wof_name']").attr("value",metro.properties.label);

      requestBoundingBox = this.calculateNewBox(metro.bbox);

      this.drawRequestBox();

      d3.json("/wof/"+geoID+".geojson",function(data){
        outline = L.geoJson(data.geometry, { className : "outline" }).addTo(displayMap);
        displayMap.addLayer(outline);
      });

      var bbox = metro.bbox,
        p1 = L.latLng(bbox[1],bbox[0]),
        p2 = L.latLng(bbox[3],bbox[2]);
      var encompassed = [{
        country : "Encompassing Metros",
        metros : []
      }];
      extractLayers.forEach(function(l){
        if (l.getBounds().contains(p1) && l.getBounds().contains(p2)) 
          encompassed[0].metros.push({
            name : l.feature.properties.display_name,
            href : l.feature.properties.href,
            country : l.feature.properties.name.split("_")[1],
            bbox : l.feature.bbox
          })
      });

      var requestDiv = d3.select("#request-wrapper");

      requestDiv.select("#make-request")
        .style("display","block")
        .selectAll(".name").text(metro.properties.name);

      if (encompassed[0].metros.length){
        requestDiv.attr("class","encompassed");
        this.drawList(encompassed, geoID, metro.properties.name);
        return;
      }

      var biggestDist = Math.max(requestBoundingBox[1][1] - requestBoundingBox[0][1], requestBoundingBox[1][0] - requestBoundingBox[0][0]);
      if (biggestDist > 5)
        requestDiv.attr("class","request-greater-5");
      else if (biggestDist > 1)
        requestDiv.attr("class","request-greater-1");
      else
        requestDiv.attr("class","default");
    },
    clearMap : function() {
      if (rect) displayMap.removeLayer(rect);
      if (outline) displayMap.removeLayer(outline);
      dots.forEach(function(l){
        displayMap.removeLayer(l);
      });
      dots = [];
    },
    clearRequest : function() {
      this.clearMap();
      d3.select("#did-you-mean").style("display","none");
      d3.select("#make-request").style("display","none");
    },
    calculateOffset : function(theta, d, lat1, lng1) {
      var lat1 = lat1.toRad(), 
        lng1 = lng1.toRad(),
        R = 6371;

      var lat2 = Math.asin( Math.sin(lat1)*Math.cos(d/R) 
            + Math.cos(lat1)*Math.sin(d/R)*Math.cos(theta) ),
        lng2 = lng1 + Math.atan2(Math.sin(theta)*Math.sin(d/R)*Math.cos(lat1), 
              Math.cos(d/R)-Math.sin(lat1)*Math.sin(lat2));

      return [lat2.toDeg(), lng2.toDeg()];
    },
    calculateNewBox : function(bbox) {
      var distance = Math.sqrt(Math.pow(bbox[3]-bbox[1],2) + Math.pow(bbox[2]-bbox[0], 2))*25,
        northEast = this.calculateOffset(-Math.PI*3/4, distance, bbox[1], bbox[0]),
        southWest = this.calculateOffset(Math.PI/4, distance, bbox[3], bbox[2]);
      return [northEast, southWest];
    },
    drawRequestBox : function() {
      this.clearMap();
      var m = this;
      rect = new L.Rectangle(new L.LatLngBounds(requestBoundingBox), { className : "blue" });
      displayMap.addLayer(rect);
      
      var myIcon = L.divIcon({className: 'drag-icon'});

      var cSW = new L.marker(requestBoundingBox[0], { icon : myIcon, draggable: true });
      dots.push(cSW);
      var cNE = new L.marker(requestBoundingBox[1], { icon : myIcon, draggable: true });
      dots.push(cNE);

      cSW.on("drag",function(e){
        requestBoundingBox[0] = [e.target.getLatLng().lat, e.target.getLatLng().lng];
        m.redrawBox();
      });
      cNE.on("drag",function(e){
        requestBoundingBox[1] = [e.target.getLatLng().lat, e.target.getLatLng().lng];
        m.redrawBox();
      });

      dots.forEach(function(l){
        displayMap.addLayer(l);
      });
      this.fillRequestForm();
    },
    redrawBox : function() {
      displayMap.removeLayer(rect);
      rect = new L.Rectangle(new L.LatLngBounds(requestBoundingBox), { className : "blue" });
      displayMap.addLayer(rect);
      this.fillRequestForm();
    },
    fillRequestForm : function() {
      d3.select("input[name='bbox_n']").attr("value",requestBoundingBox[1][0]);
      d3.select("input[name='bbox_w']").attr("value",requestBoundingBox[0][1]);
      d3.select("input[name='bbox_s']").attr("value",requestBoundingBox[0][0]);
      d3.select("input[name='bbox_e']").attr("value",requestBoundingBox[1][1]);
    }
  }
  return MetrosApp;
}