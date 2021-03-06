var mymap;
var parcelLayer;

mymap = new L.map('mapid', {
    preferCanvas: true //for performance when loading all parcel geometries
});
mymap.setView([29.198, -81.08], 13)

L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1,
    accessToken: 'pk.eyJ1IjoibGV0aGFsY2FmZmVpbmUiLCJhIjoiY2tiemlicjByMWEyeTJ2bnQxaDJoMnUzayJ9.YE5cT09nbl3jCO45Oh8Qog'
}).addTo(mymap);

parcelLayer = L.geoJSON(false, {style: function(feature) {
    switch (true) {
        case (feature.properties.INCOME > 50000):
            return {color: "#ff0000"};
        case (feature.properties.INCOME < 50000):
            return {color: "#0000ff"};
    }}}).addTo(mymap);

//
// Functions
//

function makeAjaxGetCall(url) {
    return $.ajax({
        url: url,
        method: "GET",
        contentType: 'application/json',
    });
}

function makeAjaxPostCall(url, data) {
    return $.ajax({
                url: url,
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ name: data.val() })
            });
}

function addFeatureToLayer(geojson) {
    if (mymap.hasLayer(parcelLayer)) {
        parcelLayer.addData(geojson);
    }
    else {
        parcelLayer = L.geoJSON().addTo(mymap);
        parcelLayer.addData(geojson);
    }
}

function getGeoJson() {
    let url = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/8/query?where=STATE%3D+%2712%27+AND+COUNTY+%3D+%27127%27&text=&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&relationParam=&outFields=*&returnGeometry=true&returnTrueCurves=false&maxAllowableOffset=&geometryPrecision=&outSR=&returnIdsOnly=false&returnCountOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&gdbVersion=&returnDistinctValues=false&resultOffset=&resultRecordCount=&queryByDistance=&returnExtentsOnly=false&datumTransformation=&parameterValues=&rangeValues=&f=geojson"
    var response = fetch(url).then(response => {
        return response.json();
    });
    return response;
}

function getBlockGroupData(getParams) {
    var key = '125d1b7224cadc62c574b7c23b49e700d740bbb4';
    let url = `https://api.census.gov/data/2018/acs/acs5?get=${getParams}&for=block%20group:*&in=state:12%20county:127%20tract:*&key=${key}`;
    var response = fetch(url).then(response => {
            return response.json();
        });
    return response;
}

async function getIncomeData(getParams) {

    const geojson = await getGeoJson();
    geojson.features.sort((a, b) => parseInt(a.properties.TRACT) - parseInt(b.properties.TRACT));

    const blockData = await getBlockGroupData(getParams);
    var dict = {};
    blockData[0].forEach((item, index) => {
        dict[item] = index;
    });
    blockData.sort((a_1, b_1) => parseInt(a_1[dict["tract"]]) - parseInt(b_1[dict["tract"]]));

    for (var i = 1; i < blockData.length; ++i) {
        try {
            //There can be duplicate tracts (same tract number but different block id), 
            //so we filter on the common tract numbers and then on block group to get the correct geometry.
            var matchingTract = blockData.filter(geom => geom[dict["tract"]] == geojson.features[i].properties.TRACT);
            var matchingBlockGroup = matchingTract.filter(geom_1 => geom_1[dict["block group"]] == geojson.features[i].properties.BLKGRP);
            geojson.features[i].properties.INCOME = matchingBlockGroup[0][dict["B19025_001E"]] / matchingBlockGroup[0][dict["B19001_001E"]];
            console.log(geojson.features[i].properties.INCOME);
        }
        catch (e) {
            continue;
        }
    }
    return geojson;
}

//
// AJAX methods
//

$('#formParcel').on('submit', function(event){
    event.preventDefault();

    var parcelInput = $('#parcelId');

    console.log("Client requested parcel ID: " + parcelInput.val());
    var geojson = makeAjaxPostCall('/parcels', parcelInput);
    parcelInput.val('');
    
    geojson.then(function(response){
        console.log(response);
        var obj = JSON.parse(response);
        addFeatureToLayer(obj);
    });
});

$('#clearMap').on('click', function(event){
    event.preventDefault();
    console.log("Clear layers");
    parcelLayer.remove();
});

$('#plotAllParcels').on('click', function(event){
    event.preventDefault();
    console.log("Plot all parcels");
    var geometries = makeAjaxGetCall('/parcels');
    geometries.then(function (response) {
        const array = response;
        array.forEach(function(item) {
            try {
                addFeatureToLayer(JSON.parse(item["st_asgeojson"]));
            }
            catch {
                console.log(item);
            }
        });
    });
});

$('#plotCommercialParcels').on('click', function(event){
    event.preventDefault();
    console.log("Plot all available commercial properties");
    var geometries = makeAjaxGetCall('/parcels/commercial');
    geometries.then(function (response) {
        const array = response;
        array.forEach(function(item) {
            try {
                console.log(item);
                addFeatureToLayer(JSON.parse(item["st_asgeojson"]));
            }
            catch {
                console.log(item);
            }
        });
    });
});

$('#plotBlockGroups').on('click', function(event){
    event.preventDefault();

    async function plotIncome() {
        let data = await getIncomeData('NAME,B19001_001E,B19025_001E');
        parcelLayer.addData(data);
    }
    plotIncome();

});

$('#plotDemographicNodes').on('click', function(event){
    event.preventDefault();

    async function plotWeightedNodes() {
        let data = await getIncomeData('NAME,B19001_001E,B19025_001E')

        data.features.forEach((item) => {
            var lat = item.properties.CENTLAT;
            var long = item.properties.CENTLON;

            try {
                L.circle([lat, long], {
                    color: 'red',
                    fillColor: '#f03',
                    fillOpacity: 0.5,
                    radius: (item.properties.INCOME / 100)
                }).addTo(mymap);
            }
            catch {
                console.log("Null income");
            }
        });
    }

    plotWeightedNodes();
});

// $.getJSON("public/geojson/blockgroups.geojson", function(data) {
//     addFeatureToLayer(data);
// }).fail(function(){
//     console.log("Could not get inside $.getJSON");
// });
    
