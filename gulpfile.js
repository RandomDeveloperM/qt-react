var gulp = require('gulp');
var babel = require('gulp-babel');
var minify = require('gulp-minify');
var concat = require('gulp-concat');
var browserify = require('gulp-browserify');
var reactify = require('reactify');

gulp.task('default', ['copy'], function(){
    return gulp.src('js/vortex.jsx')
            .pipe(babel({presets:['es2015', 'react']}))
            .pipe(browserify({transform: [reactify]}))
            .pipe(minify())
            .pipe(gulp.dest('dist'))
});

gulp.task('copy', ['copy-icons'], function(){
    return gulp.src(['index.html'])
        .pipe(gulp.dest('dist'))
});
gulp.task('copy-icons', function(){
    return gulp.src(['icons/*.png']).pipe(gulp.dest('dist/icons'));
});

gulp.task('watch', function(){
    return gulp.watch(['js/**/*.jsx', 'index.html'], ['default']);
});