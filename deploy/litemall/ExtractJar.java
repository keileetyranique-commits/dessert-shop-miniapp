import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** ZipFile supports the upstream executable JAR's prepended shell launcher. */
public class ExtractJar {
    public static void main(String[] args) throws Exception {
        Path destination = Paths.get(args[1]).toAbsolutePath().normalize();
        try (ZipFile archive = new ZipFile(args[0])) {
            Enumeration<? extends ZipEntry> entries = archive.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                Path target = destination.resolve(entry.getName()).normalize();
                if (!target.startsWith(destination)) throw new IllegalArgumentException("Invalid archive path");
                if (entry.isDirectory()) Files.createDirectories(target);
                else {
                    Files.createDirectories(target.getParent());
                    try (java.io.InputStream input = archive.getInputStream(entry)) {
                        Files.copy(input, target);
                    }
                }
            }
        }
    }
}
