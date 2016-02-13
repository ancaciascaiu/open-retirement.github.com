var map = L.map('map').setView([41.907477, -87.685913], 10);

L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Create empty, default bar chart

var markerArray = [];

var barChartData = {
  labels : ["Overall", "Health", "QM", "Staff", "RN"],
  datasets : [
    {
      fillColor : "#000080",
      highlightFill: "#000080",
      data : [0,0,0,0,0]
    },
  ]
};

var ctx = document.getElementById("canvas").getContext("2d");
var barChartOptions = {
  responsive : true,
  scaleOverride : true,
  scaleIntegersOnly: true,
  scaleSteps: 5,
  scaleStepWidth: 1,
  scaleStartValue: 0
};

var ctx_bar = new Chart(ctx).Bar(barChartData, barChartOptions);

// Create popup for each nursing home facility pulling its properties

function onEachFeature(feature, layer) {
  layer.bindPopup("<b>Facility:</b> " + feature.properties.name + "<br>" +
                  "<b>Overall:</b> " + feature.properties.scores[0] + "<br>" +
                  "<b>Health Inspection:</b> " + feature.properties.scores[1] + "<br>" +
                  "<b>QM:</b> " + feature.properties.scores[2] + "<br>" +
                  "<b>Staffing:</b> " + feature.properties.scores[3] + "<br>" +
                  "<b>RN Staffing:</b> " + feature.properties.scores[4]);
  layer.on('click', function(e) {
    var facility_data = barChartData;
    ret_data = feature.properties.scores.map(function(score) {return parseFloat(score);});
    facility_data.datasets[0].data = ret_data;
    ctx_bar.destroy();
    ctx_bar = new Chart(ctx).Bar(facility_data, barChartOptions);
    $("#canvas-label").text(feature.properties.name);
  });
}

// Callback for loading nursing homes from Medicare Socrata API

function handleMedicareResponse(responses) {
  var fac_geo_agg = responses.map(function(facility) {
    var fac_geo = {
      type: "Feature",
      properties: {},
      geometry: {
          type: "Point",
          coordinates: []
      }
    };
    fac_geo.properties.street_addr = facility.provider_address;
    fac_geo.properties.city = facility.provider_city;
    fac_geo.properties.state = facility.provider_state;
    fac_geo.properties.scores = [facility.overall_rating,
                                 facility.health_inspection_rating,
                                 facility.qm_rating,
                                 facility.staffing_rating,
                                 facility.rn_staffing_rating];
    // Figure out how to handle undefined here
    fac_geo.properties.name = facility.provider_name;
    fac_geo.geometry.coordinates = [parseFloat(facility.location.longitude),
                                    parseFloat(facility.location.latitude)];
    var add_fac_geo = L.geoJson(fac_geo, {
      onEachFeature: onEachFeature
    });
    add_fac_geo.addTo(map);
    markerArray.push(add_fac_geo);
  });
}

// Functions for querying by address point and neighborhood

function queryPointMedicare(latlon) {
  // Currently querying for all codes
  var query_string = "https://data.medicare.gov/resource/4pq5-n9py.json?$where=within_circle(location," +
                     latlon[1] + "," + latlon[0] + ",1500)";
  $.ajax({
      url: query_string,
      dataType: "json",
      success: handleMedicareResponse
  });
}

/* Medicare search by neighborhood */

function queryBoxMedicare(bbox) {
  // Currently querying for all codes
  var query_string = "https://data.medicare.gov/resource/4pq5-n9py.json?$where=within_box(location," +
                   bbox.toString() + ")";
  $.ajax({
      url: query_string,
      dataType: "json",
      success: handleMedicareResponse
  });
}

// Mapzen search functionality and details

var API_RATE_LIMIT = 1000;
var inputElement = document.getElementById("addr-search");

var mapzen_key = "search-Cq8H0_o";
var auto_url = 'https://search.mapzen.com/v1/autocomplete';
var search_url = 'https://search.mapzen.com/v1/search';

// Set up bounding boxes for zip codes

var chi_boxes = chi_zip.features.map(function(geo) {
  var geo_box = {};
  geo_box.gid = geo.properties.gid;
  geo_box.zip = geo.properties.zip;
  geo_box.coordinates = [geo.geometry.coordinates[0][1].reverse(), geo.geometry.coordinates[0][3].reverse()];
  geo_box.center = [(geo_box.coordinates[0][0] + geo_box.coordinates[1][0]) / 2, (geo_box.coordinates[0][1] + geo_box.coordinates[1][1]) / 2];
  return geo_box;
});

// Create Bloodhound objects for autocomplete for zip and address

var zip_matches = new Bloodhound({
  datumTokenizer: Bloodhound.tokenizers.obj.whitespace("zip"),
  queryTokenizer: Bloodhound.tokenizers.whitespace,
  local: chi_boxes
});

var addr_matches = new Bloodhound({
  datumTokenizer: Bloodhound.tokenizers.obj.whitespace("name"),
  queryTokenizer: Bloodhound.tokenizers.whitespace,
  local: []
});

$('#addr-search').typeahead({
  highlight: true
},
{
  name: 'addresses',
  displayKey: 'name',
  source: addr_matches
});

$('#zip-search').typeahead({
  highlight: true
},
{
  name: 'zips',
  displayKey: 'zip',
  source: zip_matches
});

// Determines which Mapzen endpoint to query based on parameter

function searchAddress(submitAddr) {
  var params = {
    api_key: mapzen_key,
    "focus.point.lon": -87.63,
    "focus.point.lat": 41.88,
    text: inputElement.value
  };
  // if optional argument supplied, call search endpoint
  if (submitAddr === true) {
    callMapzen(search_url, params);
  }
  else if (inputElement.value.length > 0) {
    callMapzen(auto_url, params);
  }
}

// Call Mapzen API, handle responses

function callMapzen(url, search_params) {
  $.ajax({
    url: url,
    data: search_params,
    dataType: "json",
    success: function(data) {
      if (url === auto_url && data.features.length > 0) {
        addr_matches.clear();
        addr_matches.add(data.features.map(function(addr) {
          addr.name = addr.properties.label;
          return addr;
        }));
      }
      else if (url === search_url) {
        if (data && data.features) {
          map.setView([data.features[0].geometry.coordinates[1], data.features[0].geometry.coordinates[0]], 14);
          queryPointMedicare(data.features[0].geometry.coordinates);
        }
      }
    },
    error: function(err) {
      console.log(err);
    }
  });
}

// Create event listeners on both inputs

inputElement.addEventListener('keyup', throttle(searchAddress, API_RATE_LIMIT));

$('#addr-search').bind('typeahead:select', function(ev, data) {
  map.setView([data.geometry.coordinates[1], data.geometry.coordinates[0]], 14);
  queryPointMedicare(data.geometry.coordinates);
});

$("#addr-search").keyup(function (e) {
  if (e.keyCode == 13) {
    searchAddress(true);
  }
});

$('#zip-search').bind('typeahead:select', function(ev, data) {
  map.setView(data.center, 14);
  queryBoxMedicare(data.coordinates);
});

/*
* throttle Utility function (borrowed from underscore)
*/
function throttle (func, wait, options) {
  var context, args, result;
  var timeout = null;
  var previous = 0;
  if (!options) options = {};
  var later = function () {
    previous = options.leading === false ? 0 : new Date().getTime();
    timeout = null;
    result = func.apply(context, args);
    if (!timeout) context = args = null;
  };
  return function () {
    var now = new Date().getTime();
    if (!previous && options.leading === false) previous = now;
    var remaining = wait - (now - previous);
    context = this;
    args = arguments;
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(later, remaining);
    }
    return result;
  };
}