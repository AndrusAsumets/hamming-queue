import request from 'request';

let url = 'https://api.spotify.com/v1/search?q=year:0-3000&type=album&limit=50&offset=';
var offset = 0;
var result = [];
const OUTPUT_PATH = '../output/';
const CLIENT_ID = 'e11da65da23c4b5fa7b9b49083e494af';
const CLIENT_SECRET = '37682157a5434e97be01671ef21e551d';

var authOptions = {
	url: 'https://accounts.spotify.com/api/token',
	headers: {
		'Authorization': 'Basic ' + (new Buffer(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
	},
	form: {
		grant_type: 'client_credentials'
	},
	json: true
};

export function spotify(data) {
	const spotifyOffset = data.spotifyOffset;

	return new Promise(function(resolve, reject) {
		function querySpotify(url) {
			request.post(authOptions, function(error, response, body) {
				if (!error && response.statusCode === 200) {

					var token = body.access_token;
					var options = {
						url: url,
						headers: {
							Authorization: 'Bearer ' + token
						},
						json: true
					};

					fetchElements(options);
				}

				else {
					setTimeout(function() { querySpotify(url + spotifyOffset); }, 5000);
				}
			});
		}

		function fetchElements(options) {
			var startTime = (new Date).getTime();
			var duration = 0;

			request.get(options, function(error, response, body) {
				if (!error || body.albums) {
					var elements = body.albums.items;

					resolve({ error: null, data: elements});
				}

				else {
					setTimeout(function() { querySpotify(url + spotifyOffset); }, 5000);
				}
			});
		}

		querySpotify(url + spotifyOffset);
	});
}