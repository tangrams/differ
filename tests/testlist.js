use cases:

http://localhost:8080/?1=
&2=

a yaml against another yaml
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml&2=https://github.com/tangrams/zinc-style/blob/gh-pages/zinc-style.yaml
done!

a yaml against itself
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml&2=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml
done!

a yaml against a broken yaml
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml&2=tests/bad.yaml
http://localhost:8080/?1=tests/bad.yaml=&2=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml
done!

a yaml against an empty yaml
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml&2=tests/empty.yaml
http://localhost:8080/?1=tests/empty.yaml&2=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml
done!

an empty yaml against itself
http://localhost:8080/?1=tests/empty.yaml&2=tests/empty.yaml
done!

a bad yaml against itself
http://localhost:8080/?1=tests/bad.yaml&2=tests/bad.yaml
done!

a yaml against a json with images, scenefile urls, and locations
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml&2=https://github.com/tangrams/differ/blob/gh-pages/tests/tangram01-v.5/tangram01-v.5.json
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml&2=https://github.com/tangrams/differ/blob/gh-pages/tests/tangram01-v.5/tangram01-v.5.json
done!

a yaml against a json with scenefile urls and locations only
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml&2=tests/locs+urls.json
http://localhost:8080/?1=tests/locs+urls.json&2=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml
done!

a yaml against a json with images and locations only
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml

a yaml against a json with scenefile urls only
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml&2=tests/urls.json
http://localhost:8080/?1=tests/urls.json&2=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml
!! BROKEN - should use default locations

a yaml against a json with locations only
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml
tests/locations.json

a yaml against a json with no tests
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml
tests/empty-tests.json

a yaml against an empty json
http://localhost:8080/?1=https://github.com/tangrams/refill-style/blob/gh-pages/refill-style.yaml
tests/empty-tests.json

a json with everything against another json with everything
http://localhost:8080/?1=tests/tangram01-v.5/tangram01-v.5.json&2=tests/tangram01-v.6/tangram01-v.6.json
done!

a json with locations only against a json with images, scenefile urls, and locations
http://localhost:8080/?1=tests/locations.json
https://github.com/tangrams/differ/blob/gh-pages/tests/tangram01-v.5/tangram01-v.5.json

a json with locations only against a json with locations and scenefile urls only
http://localhost:8080/?1=tests/locations.json
tests/locs+urls.json

a json with locations only against a json with scenefile urls only
http://localhost:8080/?1=tests/locations.json
tests/urls.json

a json with locations only against itself
http://localhost:8080/?1=tests/locations.json
tests/locations.json

a json with urls only against a json with images, scenefile urls, and locations
http://localhost:8080/?1=tests/urls.json
https://github.com/tangrams/differ/blob/gh-pages/tests/tangram01-v.5/tangram01-v.5.json

a json with urls only against a json with locations and scenefile urls only
http://localhost:8080/?1=tests/urls.json
tests/locs+urls.json

a json with urls only against itself
http://localhost:8080/?1=tests/urls.json
tests/urls.json


