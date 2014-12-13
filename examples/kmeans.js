#!/usr/local/bin/node --harmony

var co = require('co');
var UgridClient = require('../lib/ugrid-client.js');
var UgridContext = require('../lib/ugrid-context.js');
var ml = require('../lib/ugrid-ml.js');

var grid = new UgridClient({host: 'localhost', port: 12346, data: {type: 'master'}});

co(function *() {
	yield grid.connect();
	var devices = yield grid.send({cmd: 'devices', data: {type: 'worker'}});
	var ugrid = new UgridContext(grid, devices);

	// Bug on initial kmeans with 4 workers with this setup
	var N = 4, D = 16, K = 4;

	// This setup is ok for a few workers but exhibits the 
	// bug about worker's task synchronized start with number of workers > 10
	// var N = 100, D = 2, K = 4;
	
	var ITERATIONS = 20;				// Number of iterations
	var time = [];

	var points = ugrid.loadTestData(N, D).persist();
	var means = yield points.takeSample(K);
	for (i = 0; i < K; i++)
		means[i] = means[i].features;

	// Display input data
	console.log('\nInitial K-means');
	console.log(means);
	// var data = yield points.collect();
	// console.log('\nData :');
	// console.log(data);

	for (var i = 0; i < ITERATIONS; i++) {
		var startTime = new Date();
		var newMeans = yield points.map(ml.closestSpectralNorm, [means])
			.reduceByKey('cluster', ml.accumulate, {acc: ml.zeros(D), sum: 0})
			.map(function(a) {
				var res = [];
				for (var i = 0; i < a.acc.length; i++)
					res.push(a.acc[i] / a.sum);
				return res;
			}, [])
			.collect();
		var endTime = new Date();
		time[i] = (endTime - startTime) / 1000;
		console.log('\nIteration : ' + i + ', Time : ' + time[i]);
		console.log(newMeans);
		// Compare current K-means with previous iteration ones
		var dist = 0;
		for (var k = 0; k < K; k++)
			for (var j = 0; j < means[k].length; j++)
				dist += Math.pow(newMeans[k][j] - means[k][j], 2);
		console.log('squared distance : ' + dist);
		means = newMeans;
		if (dist < 0.01)
			break;		
	}
	console.log('\nFirst iteration : ' + time[0]);
	if (time.length > 1) {
		time.shift();
		console.log('Later iterations : ' + time.reduce(function(a, b) {return a + b}) / (ITERATIONS - 1));
	}
	grid.disconnect();
})();
